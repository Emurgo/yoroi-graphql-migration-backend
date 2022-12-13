import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import { mapNeo4jAssets } from "../utils";
import { formatIOAddress } from "./utils";


export const ioByIndex = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const cypher = `MATCH (tx:TX)
    WHERE tx.hash = $hash
    WITH tx
    
    MATCH (o:TX_OUT)-[:producedBy]->(tx)
    WITH tx, collect(o) as outputs 
    
    RETURN tx, outputs`;

    const session = driver.session();
    try {
      const result = await session.run(cypher, { hash: req.params.tx_hash });

      if (result.records && result.records.length > 0) {
        const outputs = result.records[0].get("outputs");

        const reqIndexNumber = Number(req.params.index);
        
        const foundInInputs = outputs.find((output: any) => {
          return output.properties.index.toNumber() === reqIndexNumber;
        });

        const outputsForResponse = {
          address: formatIOAddress(foundInInputs.properties.address),
          amount: foundInInputs.properties.amount.toNumber().toString(),
          dataHash: (foundInInputs.properties.datum_hash === undefined) ? null : foundInInputs.properties.datum_hash,
          assets: mapNeo4jAssets(foundInInputs.properties.assets),
        };

        const r = {
          output: outputsForResponse,
        };

        return res.send(r);
      }

      return res.send(res);
    } finally {
      await session.close();
    }
  }
});