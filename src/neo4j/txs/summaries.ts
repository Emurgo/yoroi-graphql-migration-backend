import { Request, Response } from "express";
import { Driver, Transaction } from "neo4j-driver-core";
import { getAddressesByType } from "../utils";
import { formatNeo4jBigNumber } from "./utils";

const getBeforeArgs = (transaction: Transaction) => async (before: { blockHash: string, txHash?: string }) => {
  const { blockHash, txHash } = before;
  const block = await transaction.run(
    "MATCH (block:Block {hash: $blockHash}) RETURN block.number as number",
    { blockHash }
  );
  const blockNumber = block.records[0].get("number").toNumber() as number;

  let txIndex = null as number | null;
  if (txHash) {
    const tx = await transaction.run(
      "MATCH (tx:TX {hash: $txHash}) RETURN tx.tx_index as tx_index",
      { txHash }
    );
    txIndex = tx.records[0].get("tx_index").toNumber() as number;
  }

  return { blockNumber, txIndex };
};

export const summaries = (neo4j: Driver) => ({
  handler: async (req: Request, res: Response) => {
    const addresses = req.body.addresses as string[];
    const before = req.body.before as {
      blockHash: string,
      txHash?: string
    };

    const session = neo4j.session();
    const transaction = await session.beginTransaction();

    const beforeArgs = await getBeforeArgs(transaction)(before);

    const {
      bech32OrBase58Addresses,
      paymentCreds,
      addressFormatMap
    } = getAddressesByType(addresses);

    const addressFilter: string[] = [];
    if (bech32OrBase58Addresses.length > 0) {
      addressFilter.push("o.address in $bech32OrBase58Addresses");
    }
    if (paymentCreds.length > 0) {
      addressFilter.push("o.payment_cred in $paymentCreds");
    }

    const beforeCondition = [] as string[];
    beforeCondition.push("block.number < $blockNumber");
    if (beforeArgs.txIndex !== null) {
      beforeCondition.push("(block.number = $blockNumber AND tx.tx_index < $txIndex)");
    }

    const cypher = `
      CALL {
          MATCH (o:TX_OUT)-[:producedBy]->(tx:TX)-[:isAt]->(block:Block)
          WHERE (${addressFilter.join(" OR ")})
              AND (${beforeCondition.join(" OR ")})
          RETURN tx.hash as hash
          ORDER BY block.number, tx.tx_index
          LIMIT 20
          UNION
          MATCH (o:TX_OUT)-[:sourceOf]->(i:TX_IN)-[:inputOf]->(tx:TX)-[:isAt]->(block:Block)
          WHERE (${addressFilter.join(" OR ")})
              AND (${beforeCondition.join(" OR ")})
          RETURN tx.hash as hash
          ORDER BY block.number, tx.tx_index
          LIMIT 20
      }
      WITH collect(hash) as hashes
      MATCH (tx:TX)-[:isAt]->(block:Block)
      WHERE tx.hash IN hashes

      WITH tx, block ORDER BY block.number, tx.tx_index LIMIT 20

      OPTIONAL MATCH (tx_out:TX_OUT)-[:producedBy]->(tx)
      WITH tx, block, collect(tx_out.address) as outputAddresses, collect(tx_out.payment_cred) as outputPaymentCreds

      OPTIONAL MATCH (tx_in:TX_IN)-[:inputOf]->(tx)
      OPTIONAL MATCH (src_tx_out:TX_OUT)-[:sourceOf]->(tx_in)
      WITH tx, block, outputAddresses, outputPaymentCreds, collect(src_tx_out.address) as inputAddresses, collect(src_tx_out.payment_cred) as inputPaymentCreds

      RETURN {
          txHash: tx.hash,
          blockHash: block.hash,
          txBlockIndex: tx.tx_index,
          epoch: block.epoch,
          slot: block.slot,
          inputAddresses: inputAddresses,
          outputAddresses: outputAddresses,
          outputPaymentCreds: outputPaymentCreds,
          inputPaymentCreds: inputPaymentCreds
      } as tx
      ORDER BY block.number, tx.tx_index
      LIMIT 20
    `;

    const result = await transaction.run(cypher, {
      bech32OrBase58Addresses,
      paymentCreds,
      blockNumber: beforeArgs.blockNumber,
      txIndex: beforeArgs.txIndex,
    });

    const txs = result.records.reduce((prev, curr) => {
      const tx = curr.get("tx");

      const summary = {
        txHash: tx.txHash,
        blockHash: tx.blockHash,
        txBlockIndex: formatNeo4jBigNumber(tx.txBlockIndex, "number"),
        epoch: formatNeo4jBigNumber(tx.epoch, "number"),
        slot: formatNeo4jBigNumber(tx.slot, "number"),
      };

      const inputAddresses = tx.inputAddresses as string[];
      const outputAddresses = tx.outputAddresses as string[];
      const outputPaymentCreds = tx.outputPaymentCreds as string[];
      const inputPaymentCreds = tx.inputPaymentCreds as string[];

      const providedAddresses = Object.keys(addressFormatMap);

      const allAddresses = [
        ...inputAddresses,
        ...outputAddresses,
        ...outputPaymentCreds,
        ...inputPaymentCreds,
      ];

      const addresses = allAddresses.filter((address) => providedAddresses.includes(address));
      for (const address of addresses) {
        const providedAddress = addressFormatMap[address];
        if (!prev[providedAddress]) {
          prev[providedAddress] = [];
        }
        if (!prev[providedAddress].find((x: typeof summary) => x.txHash === summary.txHash)) {
          prev[providedAddress].push(summary);
        }
      }

      return prev;
    }, {} as {[key: string]: any});

    await transaction.rollback();
    await session.close();

    return res.json(txs);
  }
});