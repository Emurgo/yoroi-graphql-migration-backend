import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import {
  RewardAddress,
  Address,
  Ed25519KeyHash, StakeCredential, NetworkInfo,

} from "@emurgo/cardano-serialization-lib-nodejs";
import config from "config";

export const registrationHistory = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const addrKeyHashes = [];
    for (const addrString of req.body.addresses) {

      //return if addrString is undefined
      if (addrString !== undefined) {
        const rwdAddr = RewardAddress.from_address(
          Address.from_bytes(
            Buffer.from(addrString, "hex"))
        );

        //TODO: ask what to do if rwdAddr is undefined
        if (rwdAddr !== undefined) {
          const cred = rwdAddr.payment_cred();
          const keyHash = cred.to_keyhash();

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
    const result = await session.run(cypher, { hash: addrKeyHashes });

    const certificatesForResponse: any = {};

    for (const res of result.records) {
      const certificate = res.get("certificate");

      const keyHashCertificate = Ed25519KeyHash.from_bytes(Buffer.from(certificate.certificate, "hex"));
      const network = config.get("network") === "mainnet" ? NetworkInfo.mainnet() : NetworkInfo.testnet();
      const stakeCredential = StakeCredential.from_keyhash(keyHashCertificate);
      const address = RewardAddress.new(network.network_id(), stakeCredential);

      const hexAddress = Buffer.from(address.to_address().to_bytes()).toString("hex");

      keyHashCertificate.free();
      network.free();
      stakeCredential.free();
      address.free();

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

    await session.close();

    return res.send(certificatesForResponse);
  }
});