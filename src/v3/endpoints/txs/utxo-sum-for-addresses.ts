import { Request, Response } from "express";
import { MongoClient } from "mongodb";
import { getUtxosForAddresses } from "../../queries/utxos-for-addresses";

export const utxoSumForAddressesHandler = (
  mongoClient: MongoClient
) => async (
  req: Request, res: Response
) => {
  const db = mongoClient.db("cardano");
  const blocksCollection = db.collection("blocks");

  if (!req.body || !req.body.addresses) {
    throw new Error("error, no addresses.");
  }

  const utxosCursor = getUtxosForAddresses(
    blocksCollection
  )(req.body.addresses);

  const agg: {
    sum: string,
    tokensBalance: {
      assetId: string,
      amount: string
    }[]
  } = {
    sum: "0",
    tokensBalance: []
  };
  while ((await utxosCursor.hasNext())) {
    const doc = await utxosCursor.next();
    if (!doc) continue;
    
    const prevSum = BigInt(agg.sum ?? 0);
    agg.sum = (prevSum + BigInt(doc.amount)).toString();
    if (doc.assets) {
      doc.assets.forEach((a: any) => {
        const assetId = `${a.policy}.${a.asset}`;
        const prevTokenBalance = agg.tokensBalance.find(t => t.assetId === assetId);
        if (prevTokenBalance) {
          const prevTokenSum = BigInt(prevTokenBalance.amount ?? 0);
          prevTokenBalance.amount = (prevTokenSum + BigInt(a.amount)).toString();
        } else {
          agg.tokensBalance.push({
            amount: a.amount.toString(),
            assetId: assetId
          });
        }
      });
    }
  }

  return res.send(agg);
};
