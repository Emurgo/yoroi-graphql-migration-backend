import * as Cardano from "@emurgo/cardano-serialization-lib-nodejs";
import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import { createCslContext } from "../../utils/csl";
import { getAddressesByType } from "../utils";

const paymentCredsCypher = `MATCH (o:TX_OUT)
WHERE o.payment_cred IN $paymentCreds
RETURN DISTINCT o.payment_cred as a`;

const addressesCypher = `MATCH (o:TX_OUT)
WHERE o.address IN $bech32OrBase58Addresses
RETURN DISTINCT o.address as a`;

export const filterUsed = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {
    const ctx = createCslContext();

    const addresses = req.body.addresses as string[];

    const {
      bech32OrBase58Addresses,
      paymentCreds,
      addressFormatMap
    } = getAddressesByType(addresses);

    const cypherParts = [];
    if (bech32OrBase58Addresses.length > 0) {
      cypherParts.push(addressesCypher);
    }

    if (paymentCreds.length > 0) {
      cypherParts.push(paymentCredsCypher);
    }

    const cypher = cypherParts.join("\nUNION\n");

    const session = driver.session();

    try {
      const result = await session.run(cypher, {
        bech32OrBase58Addresses,
        paymentCreds
      });
  
      const usedAddresses = result.records.map(r => {
        const a = r.get("a");
  
        if (a.startsWith("8200581c")) {
          const cred = ctx.wrap(Cardano.StakeCredential.from_bytes(
            Buffer.from(a, "hex")
          ));
          const keyHash = ctx.wrapU(cred.to_keyhash());
          return keyHash?.to_bech32("addr_vkh");
        } else {
          return addressFormatMap[a];
        }
      });

      return res.send(usedAddresses);
    } finally {
      await session.close();
      ctx.freeAll();
    }
  }
});