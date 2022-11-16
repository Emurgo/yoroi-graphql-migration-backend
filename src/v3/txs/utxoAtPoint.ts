import { Request, Response } from "express";
import { Integer, Driver } from "neo4j-driver-core";
import { mapNeo4jAssets } from "../utils";

export const utxoAtPoint = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {
    if (!req.body || !req.body.addresses) {
      throw new Error("error, no addresses.");
    }
    if (!req.body.referenceBlockHash) {
      throw new Error("error, missing the `referenceBlockHash`.");
    }

    const page = parseInt(req.body.page);
    const pageSize = parseInt(req.body.pageSize);

    if (isNaN(page) || isNaN(pageSize)) {
      throw new Error("error, page and pageSize should be numbers.");
    }

    if (page <= 0 || pageSize <= 0) {
      throw new Error("error, page and pageSize should be pasitive integers.");
    }

    const addresses = req.body.addresses as string[];
    const referenceBlockHash = req.body.referenceBlockHash;

    const cypherBlock = `MATCH (b:Block)
    WHERE b.hash = $hash
    RETURN {
      number: b.number
    } as block`;

    const session = driver.session();
    const referenceBlockResult = await session.run(cypherBlock, { hash: referenceBlockHash });

    if (!referenceBlockResult.records[0]) {
      throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
    }

    const referenceBlockNumber = referenceBlockResult.records[0].get("block").number.toNumber();

    const cypher = `MATCH (o:TX_OUT)-[:producedBy]->(tx:TX)-[:isAt]->(b:Block)
    WHERE o.address in $hashes
        AND b.number <= $referenceBlockNumber
    WITH o, tx, b
    
    OPTIONAL MATCH (o)-[:sourceOf]->(i:TX_IN)-[:inputOf]->(tx2:TX)-[:isAt]->(b2:Block)
    
    WITH o, tx, b, i, tx2, b2 WHERE (i IS NULL) OR (b2.number >= 8002105)
    
    RETURN {
            utxo_id: o.id,
            tx_hash: tx.hash,
            tx_index: o.output_index,
            receiver: o.address,
            amount: o.amount,
            assets: o.assets,
            block_num: b.number
        } as utxo
    ORDER BY tx.hash
    SKIP $pageSize * ($pageNumber-1)
    LIMIT $pageSize`;

    const result = await session.run(cypher, {
      hashes: addresses,
      referenceBlockNumber: referenceBlockNumber,
      pageSize: Integer.fromNumber(req.body.pageSize),
      pageNumber: Integer.fromNumber(req.body.page),
    });

    const r = result.records.map(r => {
      const utxo = r.get("utxo");

      return {
        utxo_id: utxo.utxo_id,
        tx_hash: utxo.tx_hash,
        tx_index: utxo.tx_index.toNumber(),
        receiver: utxo.receiver,
        amount: utxo.amount.toNumber().toString(),
        assets: mapNeo4jAssets(utxo.assets),
        block_num: utxo.block_num.toNumber()
      };
    });

    await session.close();

    return res.send(r);
  }
});