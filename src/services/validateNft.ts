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
  return new AWS.Lambda({
    region: config.get("aws.region"),
    credentials: {
      accessKeyId: config.get("aws.accessKeyId"),
      secretAccessKey: config.get("aws.secretAccessKey"),
    },
  });
};

const verifyExistingAnalysis = async (
  lambda: AWS.Lambda,
  fingerprint: string
) => {
  const response = await lambda
    .invoke({
      FunctionName: config.get("aws.lambda.nftValidator"),
      InvocationType: "RequestResponse",
      Payload: JSON.stringify({
        action: "Verify",
        fingerprint: fingerprint,
      }),
    })
    .promise();

  if (response.FunctionError) throw new Error(response.FunctionError);
  if (!response.Payload) throw new Error("unexpected error");

  return JSON.parse(response.Payload.toString());
};

const sendNftForAnalysis = async (
  lambda: AWS.Lambda,
  fingerprint: string,
  metadatImage: string
): Promise<void> => {
  const response = await lambda
    .invoke({
      FunctionName: config.get("aws.lambda.nftValidator"),
      InvocationType: "Event",
      Payload: JSON.stringify({
        action: "Validate",
        fingerprint: fingerprint,
        metadata: {
          image: metadatImage,
        },
      }),
    })
    .promise();

  if (response.FunctionError) throw new Error(response.FunctionError);
};

export const handleValidateNft =
  (pool: Pool) => async (req: Request, res: Response) => {
    const fingerprint: string = req.params.fingerprint;
    if (!fingerprint) {
      return res.status(400).send({
        error: "missing fingerprint",
      });
    }

    const lambda = getLambda();
    const existingAnalysis = await verifyExistingAnalysis(lambda, fingerprint);
    if (existingAnalysis !== "NOT_FOUND") {
      return res.status(200).send(existingAnalysis);
    }

    const result = await pool.query(query, [fingerprint]);
    if (result.rowCount === 0) {
      return res.status(404).send({
        error: "Not found",
      });
    }

    const item = result.rows[0];
    if (item.meta_label !== "721") {
      return res.status(409).send({
        error: `the asset was found, but it has an incorrect metadata label. Expected '721, but it is ${item.meta_label}`,
      });
    }

    if (!item.metadata[item.policy]) {
      return res.status(409).send({
        metadata: item.metadata,
        error: `missing policy ('${item.policy}') field on metadata`,
      });
    }

    if (!item.metadata[item.policy][item.name]) {
      return res.status(409).send({
        metadata: item.metadata,
        error: `missing name ('${item.name}') field on metadata`,
      });
    }

    const metadata = item.metadata[item.policy][item.name];
    if (!metadata.image) {
      return res.status(409).send({
        metadata: item.metadata,
        error: "missing image field on metadata",
      });
    }

    if (req.query.skipValidation) {
      return res.status(204).send();
    }

    await sendNftForAnalysis(lambda, fingerprint, metadata.image);

    return res.status(202).send();
  };
