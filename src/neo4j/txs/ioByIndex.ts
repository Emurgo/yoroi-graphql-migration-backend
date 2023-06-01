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
    WHERE o.output_index = $index
    WITH tx, collect(o) as output 
    
    RETURN output`;

    const session = driver.session();
    try {
      const result = await session.run(cypher, { hash: req.params.tx_hash, index: parseInt(req.params.index) });

      if (result.records && result.records.length > 0) {
        const output = result.records[0].get("output")[0];

        const outputsForResponse = {
          address: formatIOAddress(output.properties.address),
          amount: output.properties.amount.toNumber().toString(),
          dataHash: (output.properties.datum_hash === undefined) ? null : output.properties.datum_hash,
          assets: mapNeo4jAssets(output.properties.assets),
        };

        const r = {
          output: outputsForResponse,
        };

        return res.send(r);
      }

      return res.send("No outputs found");
    } finally {
      await session.close();
    }
  }
});