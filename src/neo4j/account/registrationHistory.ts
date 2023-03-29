import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import * as Cardano from "@emurgo/cardano-serialization-lib-nodejs";
import config from "config";
import { createCslContext } from "../../utils/csl";

export const registrationHistory = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {
    const ctx = createCslContext();

    try {
      const addrKeyHashes = [];
      for (const addrString of req.body.addresses) {

        //return if addrString is undefined
        if (addrString !== undefined) {
          const rwdAddr = ctx.wrapU(Cardano.RewardAddress.from_address(
            ctx.wrap(Cardano.Address.from_bytes(
              Buffer.from(addrString, "hex")))
          ));

          if (rwdAddr !== undefined) {
            const cred = ctx.wrap(rwdAddr.payment_cred());
            const keyHash = ctx.wrapU(cred.to_keyhash());

            if (keyHash) {
              addrKeyHashes.push(Buffer.from(keyHash.to_bytes()).toString("hex"));
            }
          }
        }
      }

      const cypher = `MATCH (c:CERTIFICATE)
      WHERE c.addrKeyHash in $hash
      WITH c
      MATCH (c)-[:generatedAt]->(t:TX)-[:isAt]->(b:Block)
      WITH c, t, b
      WHERE c.type = 'stake_registration' or c.type = 'stake_deregistration'

      RETURN {
          certificate: c.addrKeyHash,
          slot: b.slot,
          txIndex: t.tx_index,
          certIndex: c.cert_index,
          certType: c.type
      } as certificate`;

      const session = driver.session();
      try {
        const result = await session.run(cypher, { hash: addrKeyHashes });

        const certificatesForResponse: any = {};

        for (const res of result.records) {
          const certificate = res.get("certificate");

          const keyHashCertificate = ctx.wrap(Cardano.Ed25519KeyHash.from_bytes(Buffer.from(certificate.certificate, "hex")));
          const network = config.get("network") === "mainnet"
            ? ctx.wrap(Cardano.NetworkInfo.mainnet())
            : ctx.wrap(Cardano.NetworkInfo.testnet());
          const stakeCredential = ctx.wrap(Cardano.StakeCredential.from_keyhash(keyHashCertificate));
          const address = ctx.wrap(Cardano.RewardAddress.new(network.network_id(), stakeCredential));

          const hexAddress = Buffer.from(ctx.wrap(address.to_address()).to_bytes()).toString("hex");

          if (!certificatesForResponse[hexAddress]) {
            certificatesForResponse[hexAddress] = [];
          }

          certificatesForResponse[hexAddress].push({
            slot: certificate.slot.toNumber().toString(),
            txIndex: certificate.txIndex.toNumber(),
            certIndex: certificate.certIndex.toNumber(),
            certType: (certificate.certType.toString() === "stake_registration") ? "StakeRegistration" : "StakeDeregistration"
          });
        }

        return res.send(certificatesForResponse);
      } finally {
        await session.close();
      }
    } finally {
      ctx.freeAll();
    }
  }
});