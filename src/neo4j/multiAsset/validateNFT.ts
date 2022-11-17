import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import config from "config";
import AWS from "aws-sdk";

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
  fingerprint: string,
  envName: string
) => {
  const nftValidatorLambdaNameTemplate: string = config.get(
    "aws.lambda.nftValidator"
  );
  const functionName = nftValidatorLambdaNameTemplate.replace(
    "{envName}",
    envName
  );

  const response = await lambda
    .invoke({
      FunctionName: functionName,
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
  metadatImage: string,
  envName: string
): Promise<void> => {
  const nftValidatorLambdaNameTemplate: string = config.get(
    "aws.lambda.nftValidator"
  );
  const functionName = nftValidatorLambdaNameTemplate.replace(
    "{envName}",
    envName
  );

  const response = await lambda
    .invoke({
      FunctionName: functionName,
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

export const validateNFT = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {
    const fingerprint: string = req.params.fingerprint;
    if (!fingerprint) {
      return res.status(400).send({
        error: "missing fingerprint",
      });
    }

    const cypher = `MATCH (mint:MINT{fingerprint:$fingerprint, quantity: 1})
    WITH mint
    MATCH (mint)-[:mintedAt]->(tx:TX)-[:isAt]->(block:Block)
    RETURN mint.asset as asset,
      mint.policy as policy,
      tx.metadata as metadata
    ORDER BY block.number, tx.tx_index
    LIMIT 1`;

    const envName = req.body.envName ?? "dev";

    const lambda = getLambda();
    const existingAnalysis = await verifyExistingAnalysis(
      lambda,
      fingerprint,
      envName
    );
    if (existingAnalysis !== "NOT_FOUND") {
      return res.status(200).send(existingAnalysis);
    }

    const session = driver.session();

    const result = await session.run(cypher, {
      fingerprint: fingerprint,
    });

    await session.close();

    if (result.records.length === 0) {
      return res.status(404).send({
        error: "Not found",
      });
    }

    const record = result.records[0];
    const metadataString = record.get("metadata");

    const asset = Buffer.from(record.get("asset"), "hex").toString();
    const policy = record.get("policy");
    const metadata = JSON.parse(metadataString) as any[];

    const assetMetada = metadata.reduce((prev, curr) => {
      if (curr.label === "721") {
        if (curr.map_json[policy][asset]) {
          return curr.map_json[policy][asset];
        }
      }
      return prev;
    }, null as any);

    if (!assetMetada) {
      return res.status(409).send({
        metadata: metadata,
        error: "missing assetinfo on metadata",
      });
    }

    if (!assetMetada.image) {
      return res.status(409).send({
        metadata: metadata,
        error: "missing image field on metadata",
      });
    }

    if (req.query.skipValidation) {
      return res.status(204).send();
    }

    await sendNftForAnalysis(lambda, fingerprint, assetMetada.image, envName);

    return res.status(202).send();
  }
});