import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import axios from "axios";

import config from "config";

const smashEndpoint: string = config.get("server.smashEndpoint");
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

    const payload = (cert: any, block: any) => {
      switch (cert.type) {
        case "pool_registration":
          return {
            kind: "PoolRegistration",
            certIndex: cert.cert_index.toNumber(),
            poolParams: {
              operator: cert.operator,
              vrfKeyHash: cert.vrf_keyhash,
              pledge: cert.pledge.toNumber().toString(),
              cost: cert.cost.toNumber().toString(),
              margin: cert.margin,
              rewardAccount: cert.reward_account,
              poolOwners: cert.pool_owners.map((owner: any) => { return "e1" + owner; }),
              relays: JSON.parse(cert.relays).map((r: any) => ({
                ipv4: (r.ipv4) ? r.ipv4.data.join(".") : null,
                ipv6: r.ipv6,
                dnsName: (r.dnsName) ? r.dnsName.toString() : null,
                dnsSrvName: (r.dns_srv_name) ? r.dns_srv_name.data.toString() : null,
                port: r.port.toString(),
              })),
              poolMetadata: {
                url: cert.url,
                metadataHash: cert.pool_metadata_hash
              }
            }
          };
        case "pool_retirement":
          return {
            kind: "PoolRetirement",
            certIndex: cert.cert_index.toNumber(),
            poolKeyHash: cert.pool_keyhash,
            epoch: cert.epoch.toNumber(),
          };
      }
    };

    const getSmasheInfo = async (hash: string, metadataHash: string) => {
      try {
        const endpointResponse = await axios.get(`${smashEndpoint}${hash}/${metadataHash}`);
        if (endpointResponse.status === 200) {
          return endpointResponse.data;
        } else {
          console.log(`SMASH did not respond to user submitted hash: ${hash}`);
        }
      } catch (e) {
        console.log(`SMASH did not respond with hash ${hash}, giving error ${e}`);
      }
    };


    const session = driver.session();
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
            payload: payload(cert, block)
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

          const infoFromSmash = await getSmasheInfo(hash, metadataHash);
          if (infoFromSmash) {
            poolsForResponse[hash].info = infoFromSmash;
          }
        }
      }
    }

    await session.close();

    return res.send(poolsForResponse);
  }
});