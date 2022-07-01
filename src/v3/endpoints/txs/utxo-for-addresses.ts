import { Request, Response } from "express";
import { Db } from "mongodb";
import { getUtxosForAddresses } from "../../queries/utxos-for-addresses";

export const utxoForAddressesHandler = (
  db: Db
) => async (
  req: Request, res: Response
) => {
  const blocksCollection = db.collection("blocks");

  if (!req.body || !req.body.addresses) {
    throw new Error("error, no addresses.");
  }

  const utxosCursor = getUtxosForAddresses(
    blocksCollection
  )(req.body.addresses);

  const utxos: any[] = [];
  while ((await utxosCursor.hasNext())) {
    const doc = await utxosCursor.next();
    if (!doc) continue;
    utxos.push({
      utxo_id: doc.id,
      tx_hash: doc.tx_hash,
      tx_index: doc.tx_index,
      receiver: doc.address,
      amount: doc.amount.toString(),
      dataHash: doc.data_hash ?? null,
      assets: doc.assets
        ? doc.assets.map((a: any) => ({
          assetId: a.policy + "." + a.asset,
          policyId: a.policy,
          name: a.asset_ascii,
          amount: a.amount.toString(),
        }))
        : [],
      block_num: doc.block_num,
    });
  }

  return res.send(utxos);
};
