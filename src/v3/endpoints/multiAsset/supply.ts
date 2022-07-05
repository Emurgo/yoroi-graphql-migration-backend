import { Request, Response } from "express";
import { MongoClient } from "mongodb";

export const multiAssetSupplyHandler = (
  mongoClient: MongoClient
) => async (
  req: Request, res: Response
) => {
  if (!req.body || !req.body.assets)
    throw new Error("missing assets on request body");
  if (!Array.isArray(req.body.assets))
    throw new Error("assets should be an array");
  if (req.body.assets.length === 0)
    throw new Error("assets should not be empty");
  if (req.body.assets.find((a: any) => !a.policy))
    throw new Error("all assets on body should have a name and a policy");

  const assets: {
    name: string;
    policy: string;
  }[] = req.body.assets;

  const supplies: { [key: string]: number } = {};

  const db = mongoClient.db("cardano");
  const blocksCollection = db.collection("blocks");

  const firstMatch: any[] = [];
  const secondMatch: any[] = [];
  assets.forEach(a => {
    firstMatch.push({
      "asset": Buffer.from(a.name).toString("hex"),
      "policy": a.policy
    });
    secondMatch.push({
      "transactions.mint.asset": Buffer.from(a.name).toString("hex"),
      "transactions.mint.policy": a.policy
    });
  });

  const cursor = blocksCollection.aggregate([
    {
      $match: {
        transactions: {
          $elemMatch: {
            mint: {
              $elemMatch: {
                $or: firstMatch
              }
            }
          }
        }
      }
    },
    { $unwind: { path: "$transactions" } },
    { $unwind: { path: "$transactions.mint" } },
    {
      $match: {
        $or: secondMatch
      }
    },
    {
      $project: {
        policy: "$transactions.mint.policy",
        asset: "$transactions.mint.asset",
        assetId: {
          $concat: [
            "$transactions.mint.policy",
            ".",
            "$transactions.mint.asset"
          ]
        },
        quantity: {
          $convert: {
            input: "$transactions.mint.quantity",
            to: "long"
          }
        }
      }
    },
    {
      $group: {
        _id: {
          policy: "$policy",
          asset: "$asset",
        },
        amount: {
          $sum: "$quantity"
        }
      }
    },
    {
      $project: {
        _id: 0,
        asset: "$_id.asset",
        policy: "$_id.policy",
        supply: "$amount"
      }
    }
  ]);

  while ((await cursor.hasNext())) {
    const doc = await cursor.next();
    if (!doc) continue;
    supplies[`${doc.policy}.${Buffer.from(doc.asset, "hex").toString()}`] = doc.supply;
  }

  return res.send({supplies});
};