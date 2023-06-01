import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import config from "config";
import { getPayload, getSmashInfo } from "./utils";

const addressesRequestLimit: number = config.get("server.addressRequestLimit");

interface PoolDelegationRange {
  fromEpoch: number;
  toEpoch?: number;
}

export const delegationHistory = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const inputHashes = req.body.poolRanges;

    const hashes = Object.keys(inputHashes);
    if (hashes && hashes.length > addressesRequestLimit)
      throw new Error(
        `poolRanges must have between 0 and ${addressesRequestLimit} items`
      );

    const response: any = [];
    const session = driver.session();

    try {
      for (const [inputHash, epochs] of Object.entries(inputHashes)) {

        const epochRange = epochs as PoolDelegationRange;
  
        const cypher = `MATCH (c:CERTIFICATE)
        WHERE (c.type = 'pool_registration' AND c.operator = $hash) 
        OR (c.type = 'pool_retirement' AND c.pool_keyhash = $hash)
        WITH c
        MATCH (c)-[:generatedAt]->(tx:TX)-[:isAt]->(b:Block)
        WHERE (b.epoch > $fromEpochNumber) AND (b.epoch < $toEpochNumber)
        RETURN c, tx, b`;
  
        const result = await session.run(cypher, {
          hash: inputHash,
          fromEpochNumber: epochRange.fromEpoch,
          toEpochNumber: epochRange.toEpoch
        });
  
        for (const record of result.records) {
          const cert = record.get("c").properties;
          const tx = record.get("tx").properties;
          const block = record.get("b").properties;
  
          const certificateHash = (cert.operator === undefined) ? cert.pool_keyhash : cert.operator;
  
          const cypherLatestRegistration = `MATCH (c:CERTIFICATE)
          WHERE c.operator = $hash AND c.type = 'pool_registration'
          WITH max(ID(c)) as cMax, c.operator as cOp
          WITH collect(cMax) as ids
          MATCH (c:CERTIFICATE) 
          WHERE ID(c) in ids
          RETURN {
              hash: c.operator,
              metadataHash: c.pool_metadata_hash
          } as metadataHash`;
  
          const resultLatestMetadataHash = await session.run(cypherLatestRegistration, { hash: certificateHash });
          const metadataHash = resultLatestMetadataHash.records[0].get("metadataHash").metadataHash;
  
          const infoFromSmash = await getSmashInfo(certificateHash, metadataHash);
  
          response.push(
            {
              epoch: block.epoch.toNumber(),
              slot: block.epoch_slot.toNumber(),
              tx_ordinal: tx.tx_index.toNumber(),
              cert_ordinal: cert.cert_index.toNumber(),
              payload: getPayload(cert),
              info: infoFromSmash,
              poolHash: certificateHash,
            }
          );
        }
      }
  
      return res.send(response);
    } finally {
      await session.close();
    }
  }
});