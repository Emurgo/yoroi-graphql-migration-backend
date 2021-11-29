import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";

import AWS from "aws-sdk";

const query = `SELECT encode(asset.policy, 'hex') as "policy",
  encode(asset.name, 'escape') as "name",
  meta.key as "meta_label",
  meta.json as "metadata"
FROM multi_asset asset
  INNER JOIN ma_tx_mint mint on asset.id = mint.ident
  INNER JOIN tx on mint.tx_id = tx.id
  INNER JOIN tx_metadata meta on tx.id = meta.tx_id
WHERE asset.fingerprint = $1::text`;

const getLambda = (): AWS.Lambda => {
  const lambdaEndpoint = config.get("aws.lambdaEndpoint") as string;
  if (lambdaEndpoint) {
    return new AWS.Lambda({
      endpoint: lambdaEndpoint,
      region: config.get("aws.region"),
      credentials: {
        accessKeyId: config.get("aws.accessKeyId"),
        secretAccessKey: config.get("aws.secretAccessKey"),
      }
    });
  } else {
    return new AWS.Lambda({
      region: config.get("aws.region"),
      credentials: {
        accessKeyId: config.get("aws.accessKeyId"),
        secretAccessKey: config.get("aws.secretAccessKey"),
      }
    });
  }
};

type NftValidationData = {
  smallVariantFile?: string
  largeVariantFile?: string
  contentsOnImage?: string[]
  category?: string
  validated: boolean
}

const getNftValidationData = async (lambda: AWS.Lambda, fingerprint: string): Promise<NftValidationData> => {
  const lambdaResponse = await lambda.invoke({
    FunctionName: "YoroiContentValidator",
    InvocationType: "RequestResponse",
    Payload: JSON.stringify({
      action: "Verify",
      fingerprint: fingerprint
    })
  }).promise();

  if (lambdaResponse.StatusCode === 200) {
    const lambdaResponseObj: NftValidationData = JSON.parse(lambdaResponse.Payload?.toString("utf-8") ?? "{}");
    return lambdaResponseObj; 
  }

  throw new Error("unexpected error");
};

const sendNftForValidation = (
  lambda: AWS.Lambda,
  fingerprint: string,
  metadatImage: string
): void => {
  lambda.invoke({
    FunctionName: "YoroiContentValidator",
    InvocationType: "Event",
    Payload: JSON.stringify({
      action: "Validate",
      nfts: [
        {
          assetFingerprint: fingerprint,
          metadata: {
            image: metadatImage
          }
        }
      ]
    })
  }, (err, data) => {
    if (err) {
      console.error(err);
    } else {
      console.info(data);
    }
  });
};

export const handleValidateNft = (pool: Pool) => async (req: Request, res: Response) => {
  const fingerprint: string = req.params.fingerprint;
  if (!fingerprint) {
    return res.status(400).send({
      error: "missing fingerprint"
    });
  }

  const lambda = getLambda();
  const nftValidationData = await getNftValidationData(lambda, fingerprint);
  if (nftValidationData.validated) {
    return res.status(200)
      .send(nftValidationData);
  }

  const result = await pool.query(query, [fingerprint]);
  if (result.rowCount === 0) {
    return res.status(404).send({
      error: "Not found"
    });
  }

  const item = result.rows[0];
  if (item.meta_label !== "721") {
    return res.status(409)
      .send({
        error: `the asset was found, but it has an incorrect metadata label. Expected '721, but it is ${item.meta_label}`
      });
  }

  if (!item.metadata[item.policy]) {
    return res.status(409)
      .send({
        metadata: item.metadata,
        error: `missing policy ('${item.policy}') field on metadata`
      });
  }

  if (!item.metadata[item.policy][item.name]) {
    return res.status(409).send({
      metadata: item.metadata,
      error: `missing name ('${item.name}') field on metadata`
    });
  }

  const metadata = item.metadata[item.policy][item.name];
  if (!metadata.image) {
    return res.status(409).send({
      metadata: item.metadata,
      error: "missing image field on metadata"
    });
  }

  if (req.query.skipValidation) {
    return res.status(204)
      .send();  
  }

  sendNftForValidation(lambda, fingerprint, metadata.image);

  return res.status(202)
    .send();
};
