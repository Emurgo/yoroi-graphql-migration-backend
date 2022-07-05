import { Request, Response } from "express";
import { MongoClient } from "mongodb";
import { mapInput, mapOutput } from "../../utils";

export const txsIoHandler = (
  mongoClient: MongoClient
) => async (
  req: Request, res: Response
) => {
  const db = mongoClient.db("cardano");
  const blocksCollection = db.collection("blocks");

  const txHash = req.params.tx_hash;

  const cursor = blocksCollection.find({
    "transactions.hash": txHash
  }, {
    projection: {
      "transactions": {
        $elemMatch: {
          hash: txHash
        }
      }
    }
  }).limit(1);

  const doc = await cursor.next();
  if (!doc) return res.status(404).send();

  return res.send({
    inputs: doc.transactions[0].inputs.map(mapInput),
    collateralInputs: doc.transactions[0].collateral_inputs.map(mapInput),
    outputs: doc.transactions[0].outputs.map(mapOutput)
  });
};
