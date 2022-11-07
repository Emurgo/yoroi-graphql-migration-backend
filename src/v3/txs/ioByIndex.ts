import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import { mapNeo4jAssets } from "../utils";


export const ioByIndex = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const cypher = `MATCH (tx:TX)
    WHERE tx.hash = $hash
    WITH tx
    
    MATCH (o:TX_OUT)-[:producedBy]->(tx)
    WITH tx, collect(o) as outputs 
    
    RETURN tx, outputs`;

    const session = driver.session();
    const result = await session.run(cypher, { hash: req.params.tx_hash });

    if (result.records && result.records.length > 0) {
      const outputs = result.records[0].get("outputs");

      const reqIndexNumber = Number(req.params.output_index);
      
      const foundInInputs = outputs.find((output: any) => {
        return output.properties.output_index.toNumber() === reqIndexNumber;
      });

      const outputsForResponse = {
        address: foundInInputs.properties.address,
        amount: foundInInputs.properties.amount.toNumber().toString(),
        dataHash: (foundInInputs.properties.datum_hash === undefined) ? null : foundInInputs.properties.datum_hash,
        assets: mapNeo4jAssets(foundInInputs.properties.assets),
      };

      const r = {
        output: outputsForResponse,
      };

      await session.close();

      return res.send(r);
    }

    await session.close();

    return res.send(res);
  }
});