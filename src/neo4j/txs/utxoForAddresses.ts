import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import { getAddressesByType, mapNeo4jAssets } from "../utils";
import { formatIOAddress } from "./utils";

export const utxoForAddresses = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {
    const addresses = req.body.addresses as string[];

    const {
      bech32OrBase58Addresses,
      paymentCreds,
    } = getAddressesByType(addresses);

    const session = driver.session();

    const whereParts = [] as string[];

    if (bech32OrBase58Addresses.length > 0) {
      whereParts.push("o.address IN $bech32OrBase58Addresses");
    }

    if (paymentCreds.length > 0) {
      whereParts.push("o.payment_cred IN $paymentCreds");
    }

    const cypher = `MATCH (o:TX_OUT)-[:producedBy]->(tx:TX)-[:isAt]->(block:Block)
    WHERE (${whereParts.join(" OR ")})
      AND NOT (o)-[:sourceOf]->(:TX_IN)
    RETURN {
        utxo_id: o.id,
        tx_hash: tx.hash,
        tx_index: o.output_index,
        receiver: o.address,
        amount: o.amount,
        dataHash: o.datum_hash,
        assets: o.assets,
        block_num: block.number
    } as utxo`;

    const result = await session.run(cypher, {
      bech32OrBase58Addresses, paymentCreds
    });

    const r = result.records.map(r => {
      const utxo = r.get("utxo");

      return {
        utxo_id: utxo.utxo_id,
        tx_hash: utxo.tx_hash,
        tx_index: utxo.tx_index.toNumber(),
        receiver: formatIOAddress(utxo.receiver),
        amount: utxo.amount.toNumber().toString(),
        dataHash: utxo.dataHash,
        assets: mapNeo4jAssets(utxo.assets),
        block_num: utxo.block_num.toNumber()
      };
    });

    await session.close();

    return res.send(r);
  }
});