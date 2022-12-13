import config from "config";
import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import { getPayload, getSmashInfo } from "./utils";

const addressesRequestLimit: number = config.get("server.addressRequestLimit");

export const info = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const inputHashes = req.body.poolIds;

    if (!(inputHashes instanceof Array) || inputHashes.length > addressesRequestLimit)
      throw new Error(
        ` poolIds must have between 0 and ${addressesRequestLimit} items`);


    const cypher = `MATCH (c:CERTIFICATE)
    WHERE (c.type = 'pool_registration' AND c.operator in $hashes) 
    OR (c.type = 'pool_retirement' AND c.pool_keyhash in $hashes)
    WITH c
    MATCH (c)-[:generatedAt]->(tx:TX)-[:isAt]->(b:Block)
    RETURN c, tx, b`;


    const session = driver.session();
    try {
      const result = await session.run(cypher, { hashes: inputHashes });

      const poolsForResponse: any = {};

      for (const record of result.records) {
        const cert = record.get("c").properties;
        const tx = record.get("tx").properties;
        const block = record.get("b").properties;

        const certificateHash = (cert.operator === undefined) ? cert.pool_keyhash : cert.operator;

        if (!poolsForResponse[certificateHash]) {
          poolsForResponse[certificateHash] = {
            info: {},
            history: [],
          };
        }

        if (!poolsForResponse[certificateHash].history) {
          poolsForResponse[certificateHash].history = [];
        }
        else {
          poolsForResponse[certificateHash].history.push(
            {
              epoch: block.epoch.toNumber(),
              slot: block.epoch_slot.toNumber(),
              tx_ordinal: tx.tx_index.toNumber(),
              cert_ordinal: cert.cert_index.toNumber(),
              payload: getPayload(cert)
            }
          );
        }
      }

      const cypherLatestRegistration = `MATCH (c:CERTIFICATE)
      WHERE c.operator in $hashes AND c.type = 'pool_registration'
      WITH max(ID(c)) as cMax, c.operator as cOp
      WITH collect(cMax) as ids
      MATCH (c:CERTIFICATE) 
      WHERE ID(c) in ids
      RETURN {
          hash: c.operator,
          metadataHash: c.pool_metadata_hash
      } as metadataHash`;

      const resultLatestMetadataHash = await session.run(cypherLatestRegistration, { hashes: inputHashes });

      for (const hash of inputHashes) {
        if (poolsForResponse[hash]) {

          const metadataHashRecord = resultLatestMetadataHash.records.find((record) => record.get("metadataHash").hash === hash);
          if (metadataHashRecord) {
            const metadataHash = metadataHashRecord.get("metadataHash").metadataHash;

            const infoFromSmash = await getSmashInfo(hash, metadataHash);
            if (infoFromSmash) {
              poolsForResponse[hash].info = infoFromSmash;
            }
          }
        }
      }

      return res.send(poolsForResponse);
    } finally {
      await session.close();
    }
  }
});