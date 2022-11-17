import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";

export const mintTxs = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const cypher = `MATCH (mint:MINT{fingerprint:$fingerprint})
    WITH mint
    MATCH (mint)-[:mintedAt]->(tx:TX)-[:isAt]->(block:Block)
    WITH mint.fingerprint as fingerprint, mint.asset as asset, mint.policy as policy, collect({
    
    hash:tx.hash,
    block:{
        slot: block.slot,
        epoch: block.epoch
    },
    metadata: tx.metadata
    
    }) as txs
    
    RETURN {
        policy: policy,
        name: asset,
        txs: txs
    } as x`;

    const session = driver.session();
    const result = await session.run(cypher, { fingerprint: req.params.fingerprint });
    await session.close();

    const record = result.records[0].get("x");

    const response = {
      policy: record.policy,
      name: record.name,
      txs: record.txs.map((tx: any) => {
        return {
          hash: tx.hash,
          block: {
            slot: tx.block.slot.toNumber(),
            epoch: tx.block.epoch.toNumber()
          },
          metadata: (tx.metadata === null) ? null : JSON.parse(tx.metadata).map((meta: any) => {
            return {
              key: parseInt(meta.label),
              json: meta.map_json
            };
          })[0]
        };
      })
    };

    return res.send(response);
  }
});