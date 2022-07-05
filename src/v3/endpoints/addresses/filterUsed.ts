import { Request, Response } from "express";
import { MongoClient } from "mongodb";
import { mapAddresses } from "../../utils";

export const filterUsedHandler = (
  mongoClient: MongoClient
) => async (
  req: Request, res: Response
) => {
  const db = mongoClient.db("cardano");
  const blocksCollection = db.collection("blocks");

  const originalAddresses = req.body.addresses as string[];
  const mappedAddresses = mapAddresses(originalAddresses);

  const addressFilters: any[] = [];
  mappedAddresses.legacyAddr.forEach(p => {
    addressFilters.push({"transactions.outputs.address": p});
    addressFilters.push({"transactions.inputs.source.address": p});
  });
  mappedAddresses.bech32.forEach(p => {
    addressFilters.push({"transactions.outputs.address": p});
    addressFilters.push({"transactions.inputs.source.address": p});
  });
  mappedAddresses.paymentCreds.forEach(p => {
    addressFilters.push({"transactions.outputs.payment_cred": p.hex});
    addressFilters.push({"transactions.inputs.source.payment_cred": p.hex});
  });
  mappedAddresses.stakingKeys.forEach(p => {
    addressFilters.push({"transactions.certificates.stake_credential.addrKeyHash": p.hex});
    addressFilters.push({"transactions.withdrawals.address": p.hex});
  });

  const allAddresses = [
    ...mappedAddresses.legacyAddr,
    ...mappedAddresses.bech32,
    ...mappedAddresses.paymentCreds,
    ...mappedAddresses.stakingKeys,
  ];

  const foundAddresses = new Set<string>();

  const promises = allAddresses.map(async (a: any) => {
    const filterAddress = typeof a === "string" ? a : a.hex;

    const cursor = blocksCollection.find({
      $or: [
        {"transactions.outputs.address": filterAddress},
        {"transactions.inputs.source.address": filterAddress},
        {"transactions.outputs.address": filterAddress},
        {"transactions.inputs.source.address": filterAddress},
        {"transactions.outputs.payment_cred": filterAddress},
        {"transactions.inputs.source.payment_cred": filterAddress},
        {"transactions.certificates.stake_credential.addrKeyHash": filterAddress},
        {"transactions.withdrawals.address": filterAddress},
      ]
    }, {
      projection: {
        exists: true
      },
      limit: 1
    });

    if ((await cursor.hasNext())) {
      if (typeof a === "string") {
        foundAddresses.add(a);
      } else {
        foundAddresses.add(a.original);
      }
    }
  });

  await Promise.all(promises);
  return res.send([...foundAddresses]);
};
