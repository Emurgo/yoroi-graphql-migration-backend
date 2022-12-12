import { Pool } from "pg";
import { Request, Response } from "express";
import { getAddressesByType } from "../utils";
import { getBlock } from "../utils/queries/block";
import { getTransactionRowByHash } from "../utils/queries/transaction";

const extractBodyParameters = (
  body: any
): {
  addresses: string[];
  before: {
    blockHash: string;
    txHash: string | null;
  };
} => {
  if (!body) {
    throw new Error("error, missing request body.");
  }

  const addresses: string[] = body.addresses;
  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("error, no addresses.");
  }

  const beforeBlockHash = body.before.blockHash;
  if (typeof beforeBlockHash !== "string") {
    throw new Error("error, no before block");
  }

  const beforeTxHash = body.before.txHash || null;
  if (beforeTxHash !== null && typeof beforeTxHash !== "string") {
    throw new Error("error, wrong before tx type");
  }

  return {
    addresses,
    before: {
      blockHash: beforeBlockHash,
      txHash: beforeTxHash,
    },
  };
};

export const handleTxSummariesForAddresses =
  (pool: Pool) => async (req: Request, res: Response) => {
    const { addresses, before } = extractBodyParameters(req.body);

    const beforeBlock = await getBlock(pool)(before.blockHash);
    if (!beforeBlock) {
      throw new Error("BESTBLOCK_REFERENCE_MISMATCH");
    }

    let beforeTx = null;
    if (before.txHash) {
      beforeTx = await getTransactionRowByHash(pool)(before.txHash);
      if (!beforeTx) {
        throw new Error("error: before tx doesn't exist");
      }
    }
    const addressTypes = getAddressesByType(addresses);

    const queryParams = [
      [...addressTypes.legacyAddr, ...addressTypes.bech32],
      addressTypes.paymentCreds,
      beforeBlock.number,
    ];
    let beforeCondition = "(block.block_no < $3)";
    if (beforeTx) {
      queryParams.push(beforeTx.blockIndex);
      beforeCondition = `(
        block.block_no < $3
        OR (block.block_no = $3 AND tx.block_index < $4)
      )`;
    }

    const query = `SELECT
       tx.hash AS "txHash",
       tx.block_index AS "txBlockIndex", 
       block.hash AS "blockHash",
       block.epoch_no AS epoch,
       block.slot_no AS slot,
       array_agg(output.address) AS addrs_out,
       array_agg(output_of_input.address) AS addrs_in
     FROM tx
     INNER JOIN block ON block.id = tx.block_id
     INNER JOIN tx_out AS output ON output.tx_id = tx.id
     INNER JOIN tx_in ON tx.id = tx_in.tx_in_id
     INNER JOIN tx_out AS output_of_input 
       ON output_of_input.tx_id = tx_in.tx_out_id AND output_of_input.index = tx_in.tx_out_index
     WHERE ${beforeCondition}
       AND (
         output.address = any(($1):: varchar array)
         OR output.payment_cred = any(($2)::bytea array)
         OR output_of_input.address = any(($1):: varchar array)
         OR output_of_input.payment_cred = any(($2)::bytea array)
       )
     GROUP BY tx.id, block.id
     ORDER BY block.block_no DESC, tx.block_index DESC
     LIMIT 20
   `;

    const { rows } = await pool.query(query, queryParams);

    const result: { [address: string]: any[] } = {};
    const addressSet = new Set(addresses);

    for (const row of rows) {
      for (const address of [...row.addrs_in, ...row.addrs_out]) {
        if (addressSet.has(address)) {
          if (!result[address]) {
            result[address] = [];
          }
          result[address].push({
            txHash: row.txHash.toString("hex"),
            blockHash: row.blockHash.toString("hex"),
            txBlockIndex: row.txBlockIndex,
            epoch: row.epoch,
            slot: row.slot,
          });
        }
      }
    }
    res.send(result);
    return;
  };
