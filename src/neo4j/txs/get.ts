import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import { neo4jTxDataToResponseTxData} from "./utils";

export const get = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const cypher = `MATCH (tx:TX)
      WHERE tx.hash IN $tx_hashes
      
      MATCH (tx)-[:isAt]->(block:Block)
      
      WITH DISTINCT tx, block ORDER BY block.number, tx.tx_index LIMIT 50
      
      
      OPTIONAL MATCH (tx_out:TX_OUT)-[:producedBy]->(tx)
      WITH block, tx, apoc.coll.sortNodes(collect(tx_out), '^output_index') as outputs
      
      OPTIONAL MATCH (tx_in:TX_IN)-[:inputOf]->(tx)
      OPTIONAL MATCH (src_tx_out:TX_OUT)-[:sourceOf]->(tx_in)
      WITH block, tx, outputs, apoc.coll.sortMaps(collect({
        tx_in: tx_in,
        tx_out: src_tx_out
      }), '^tx_in.input_index') as inputs
      
      OPTIONAL MATCH (c_tx_in:COLLATERAL_TX_IN)-[:collateralInputOf]->(tx)
      OPTIONAL MATCH (src_tx_out:TX_OUT)-[:sourceOf]->(c_tx_in)
      WITH block, tx, outputs, inputs, collect({
        tx_in: c_tx_in,
        tx_out: src_tx_out
      }) as collateral_inputs
      
      OPTIONAL MATCH (withdrawal:WITHDRAWAL)-[:withdrewAt]->(tx)
      WITH block, tx, outputs, inputs, collateral_inputs, collect(withdrawal) as withdrawals
      
      OPTIONAL MATCH (cert:CERTIFICATE)-[:generatedAt]->(tx)
      WITH block, tx, outputs, inputs, collateral_inputs, withdrawals, apoc.coll.sortNodes(collect(cert), '^cert_index') as certificates
      
      OPTIONAL MATCH (script:SCRIPT)-[:createdAt]->(tx)
      WITH block, tx, outputs, inputs, collateral_inputs, withdrawals, certificates, collect(script) as scripts
      
      RETURN block, tx, outputs, inputs, collateral_inputs, withdrawals, certificates, scripts;`;

    const session = driver.session();
    try {
      const response = await session.run(cypher, { tx_hashes: req.body.txHashes });

      const transactionsForResponse: any = {};

      const txs = neo4jTxDataToResponseTxData(response.records);

      for (const tx of txs) {
        transactionsForResponse[tx.hash] = tx;
      }

      return res.send(transactionsForResponse);
    } finally {
      await session.close();
    }
  }
});