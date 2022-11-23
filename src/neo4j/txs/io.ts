import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import { mapNeo4jAssets } from "../utils";
import { formatIOAddress } from "./utils";


export const io = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const cypher = `MATCH (tx:TX)
    WHERE tx.hash = $hash
    WITH tx
    
    MATCH (o:TX_OUT)-[:producedBy]->(tx)
    WITH tx, collect(o) as outputs 
    
    MATCH (i:TX_IN)-[:inputOf]->(tx) 
    MATCH (so:TX_OUT)-[:sourceOf]->(i)
    WITH tx, outputs, collect({tx_in:i, tx_out:so}) as inputs
    
    OPTIONAL MATCH (ci:COLLATERAL_TX_IN)-[:collateralInputOf]->(tx) 
    OPTIONAL MATCH (cso:TX_OUT)-[:sourceOf]->(ci)
    WITH tx, outputs, inputs, collect({tx_in:ci, tx_out:cso}) as collateralInputs
    
    RETURN tx, outputs, inputs, collateralInputs`;

    const session = driver.session();
    const result = await session.run(cypher, { hash: req.params.tx_hash });

    if (result.records && result.records.length > 0) {
      const outputs = result.records[0].get("outputs");
      const inputs = result.records[0].get("inputs");
      const collateralInputs = result.records[0].get("collateralInputs");

      const inputsForResponse = inputs.map((input: any) => {
        return {
          address: formatIOAddress(input.tx_out.properties.address),
          amount: input.tx_out.properties.amount.toNumber().toString(),
          id: input.tx_out.properties.id.toString().replace(":", ""),
          index: input.tx_out.properties.output_index.toNumber(),
          txHash: input.tx_in.properties.tx_id,
          assets: mapNeo4jAssets(input.tx_out.properties.assets),
          tx_in_id: input.tx_in.properties.id,
        };
      });

      const collateralInputsForResponse = collateralInputs.map((collateralInput: any) => {
        if (collateralInput.tx_out) {
          return {
            address: formatIOAddress(collateralInput.tx_out.properties.address),
            amount: collateralInput.tx_out.properties.amount.toNumber().toString(),
            id: collateralInput.tx_out.properties.id.toString().replace(":", ""),
            index: collateralInput.tx_out.properties.output_index.toNumber(),
            txHash: collateralInput.tx_in.properties.tx_id,
            assets: mapNeo4jAssets(collateralInput.tx_out.properties.assets),
          };
        }
      }).filter((collateralInput: any) => collateralInput);

      const outputsForResponse = outputs.map((output: any) => {
        return {
          address: formatIOAddress(output.properties.address),
          amount: output.properties.amount.toNumber().toString(),
          dataHash: (output.properties.datum_hash === undefined) ? null : output.properties.datum_hash,
          assets: mapNeo4jAssets(output.properties.assets),
        };
      });

      const r = {
        inputs: inputsForResponse,
        collateralInputs: collateralInputsForResponse,
        outputs: outputsForResponse
      };

      await session.close();

      return res.send(r);
    }

    await session.close();

    return res.send(res);
  }
});