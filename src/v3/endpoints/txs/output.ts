import { Request, Response } from "express";
import { MongoClient } from "mongodb";
import { mapOutput } from "../../utils";

export const txOutputHandler = (
  mongoClient: MongoClient
) => async (
  req: Request, res: Response
) => {
  const db = mongoClient.db("cardano");
  const blocksCollection = db.collection("blocks");

  const txHash = req.params.tx_hash;
  const index = parseInt(req.params.index);

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
    output: mapOutput(doc.transactions[0].outputs[index])
  });
};
