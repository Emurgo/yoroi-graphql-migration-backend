import neo4j, { Integer, Session } from "neo4j-driver";
import { Request, Response } from "express";

export namespace Neo4jModel {
  export type Block = {
    body_size: Integer
    number: Integer
    tx_count: Integer
    era: string
    epoch_slot: Integer
    epoch: Integer
    slot: Integer
    issuer_vkey: string
    hash: string
    previous_hash: string
  }

  export type TX = {
    total_output: Integer
    output_count: Integer
    input_count: Integer
    is_valid: boolean
    fee: Integer
    tx_index: Integer
    mint_count: Integer
    ttl: Integer
    hash: string
    metadata?: string
  }

  export type TX_OUT = {
    amount: Integer,
    assets: [] | string,
    address: string,
    id: string,
    stake_cred: string,
    payment_cred: string
  }

  export type TX_IN = {
    index: Integer
    tx_id: string
  }
}

const neo4jCast = <T>(r: any) => {
  return r.properties as T;
};

const getUntilBlock = (session: Session) => async (reqBody: any) => {
  const response = await session.run(
    "MATCH (block:Block{hash:$hash}) RETURN block", {
      hash: reqBody.untilBlock
    }
  );

  if (response.records.length === 0) throw new Error("REFERENCE_BEST_BLOCK_MISMATCH");

  return response.records[0].get("block").properties as Neo4jModel.Block;
};

const getAfterBlock = (session: Session) => async (reqBody: any) => {
  if (!reqBody.after.block) return null;

  const response = await session.run(
    "MATCH (block:Block{hash:$hash}) RETURN block", {
      hash: reqBody.after.block
    }
  );

  if (response.records.length === 0) throw new Error("REFERENCE_BLOCK_MISMATCH");

  return response.records[0].get("block").properties as Neo4jModel.Block;
};

const getAfterTx = (session: Session) => async (reqBody: any) => {
  if (!reqBody.after.tx) return null;

  const response = await session.run(
    "MATCH (tx:TX{hash:$hash}) RETURN tx", {
      hash: reqBody.after.tx
    }
  );

  if (response.records.length === 0) throw new Error("REFERENCE_TX_NOT_FOUND");

  return response.records[0].get("tx").properties as Neo4jModel.TX;
};

const getPaginationParameters = (session: Session) => async (reqBody: any) => {
  const untilBlock = await getUntilBlock(session)(reqBody);
  const afterBlock = await getAfterBlock(session)(reqBody);
  const afterTx = await getAfterTx(session)(reqBody);

  return {
    untilBlock: untilBlock.number.toInt(),
    afterBlock: afterBlock?.number.toInt() ?? 0,
    afterTx: afterTx?.tx_index.toInt() ?? 0
  };
};

export const history = {
  handler: async (req: Request, res: Response) => {
    const addresses = req.body.addresses;

    const driver = neo4j.driver(
      "neo4j://dus-01.emurgo-rnd.com:7687",
      neo4j.auth.basic("neo4j", "neo4j")
    );
    const session = driver.session();

    const paginationParameters = await getPaginationParameters(session)(req.body);

    const response = await session.run(`MATCH (tx_out:TX_OUT)
WHERE tx_out.address IN $addresses
MATCH (tx_out)-[:producedBy]->(tx:TX)
OPTIONAL MATCH (tx_out)-[:sourceOf]->(tx_in:TX_IN)
OPTIONAL MATCH (tx_in)-[:inputOf]->(spentTx:TX)

WITH tx

MATCH (tx)-[:isAt]->(block:Block)
WHERE block.number <= $untilBlock AND (
  block.number > $afterBlock
) OR (
  block.number = $afterBlock
  AND tx.tx_index > $afterTx
)

OPTIONAL MATCH (tx_out:TX_OUT)-[:producedBy]->(tx)
OPTIONAL MATCH (tx_in:TX_IN)-[:inputOf]->(tx)
OPTIONAL MATCH (src_tx_out:TX_OUT)-[:sourceOf]->(tx_in)

WITH block, tx, collect(tx_out) as outputs, collect({
  tx_in: tx_in,
  tx_out: src_tx_out
}) as inputs ORDER BY block.number, tx.tx_index LIMIT 50

RETURN block, tx, outputs, inputs;`, {
  addresses,
  ...paginationParameters
});

    const txs = response.records.map(r => {
      const tx = neo4jCast<Neo4jModel.TX>(r.get("tx"));
      const block = neo4jCast<Neo4jModel.Block>(r.get("block"));
      const outputs = (r.get("outputs") as any[]).map((o: any) => neo4jCast<Neo4jModel.TX_OUT>(o));
      const inputs = (r.get("inputs") as any[]).map((i: any) => ({
        tx_in: neo4jCast<Neo4jModel.TX_IN>(i.tx_in),
        tx_out: neo4jCast<Neo4jModel.TX_OUT>(i.tx_out)
      }));
      
      // ToDo: include TXs where addresses submitted certificates or withdrawals as well
      return {
        hash: tx.hash,
        fee: tx.fee.toInt().toString(),
        metadata: tx.metadata ? JSON.parse(tx.metadata) : null,
        validContract: tx.is_valid,
        scriptSize: 0, // ToDo: missing data on Neo4j
        type: block.era === "byron" ? "byron" : "shelley",
        withdrawals: [], // ToDo: include in the query
        certificates: [], // ToDo: include in the query
        txOrdinal: tx.tx_index.toInt(),
        txState: "Successful",
        lastUpdate: null, // ToDo: this can be calculated based on the epoch
        blockNum: block.number.toInt(),
        blockHash: block.hash,
        time: null, // ToDo: this can be calculated based on the epoch
        epoch: block.epoch.toInt(),
        slot: block.epoch_slot.toInt(),
        inputs: inputs.map(i => ({
          address: i.tx_out.address,
          amount: i.tx_out.amount.toString(),
          id: i.tx_out.id,
          index: i.tx_in.index,
          txHash: i.tx_in.tx_id,
          assets: i.tx_out.assets && typeof i.tx_out.assets === "string"
            ? JSON.parse(i.tx_out.assets)
            : []
        })),
        outputs: outputs.map(o => ({
          address: o.address,
          amount: o.amount.toString(),
          id: o.id,
          assets: o.assets && typeof o.assets === "string"
            ? JSON.parse(o.assets)
            : []
        })),
      };
    });

    return res.send(txs);
  }
};