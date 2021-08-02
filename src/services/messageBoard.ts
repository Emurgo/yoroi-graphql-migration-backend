import { Pool } from "pg";
import { Request, Response } from "express";
import config from "config";

const addressesRequestLimit: number = config.get("server.addressRequestLimit");
export interface Message {
  block_no: number;
  title: string;
  content: string;
  valid: number | null;
  expire: number | null;
}
export interface CardanoMessage {
  messages: Message[];
}

interface Dictionary<T> {
  [keys: string]: T;
}

export const handleMessageBoard =
  (p: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.body.poolIds) throw new Error("No poolIds in body");
    const hashes = req.body.poolIds;

    if (!(hashes instanceof Array) || hashes.length > addressesRequestLimit)
      throw new Error(
        ` poolIds must have between 0 and ${addressesRequestLimit} items`
      );

    const fromBlock = req.body.fromBlock;
    const untilBlock = req.body.untilBlock;

    const ret: Dictionary<null | CardanoMessage> = {};

    for (const hash of hashes) {
      if (hash.length !== 56) {
        throw new Error(`Received invalid pool id: ${hash}`);
      }

      const queryMessageBoard = `
      SELECT
        b.block_no AS "block_no",
        txm.json AS "message_json"
      FROM tx_metadata txm
        JOIN tx ON (txm.tx_id = tx.id)
        JOIN block b ON (tx.block_id = b.id)
        JOIN tx_out txo ON (txm.tx_id = txo.tx_id)
      WHERE txo.stake_address_id IN (
          SELECT id
          FROM stake_address sa
          WHERE (
              RIGHT(
                sa.hash_raw::VARCHAR,
                LENGTH(sa.hash_raw::VARCHAR) -4
              )
            ) IN (
              SELECT encode(po.hash, 'hex')
              FROM pool_owner po
                JOIN pool_hash ph ON (po.pool_hash_id = ph.id)
              WHERE registered_tx_id = (
                  SELECT MAX(registered_tx_id)
                  FROM pool_owner po
                    JOIN pool_hash ph ON (po.pool_hash_id = ph.id)
                  WHERE encode(ph.hash_raw, 'hex') = $1
                )
            )
        )
        AND txm.key = 1990
        AND (
          $2::INTEGER IS NULL
          OR b.block_no >= $2
        )
        AND (
          $3::INTEGER IS NULL
          OR b.block_no <= $3
        )
      ORDER BY tx.id DESC;
    `;

      const messagesBoard = await p.query(queryMessageBoard, [
        hash,
        fromBlock,
        untilBlock,
      ]);

      const finalMessages: Message[] = [];

      messagesBoard.rows.map(async (message) => {
        try {
          const messageJson = message.message_json;
          if (
            typeof messageJson.title === "undefined" ||
            typeof messageJson.content === "undefined"
          ) {
            // if the data is malformed (missing title or content), do not return anything
            return;
          }

          // if optional parameters are missing, fill them with nulls
          const finalMessage = {
            block_no: message.block_no,
            title: messageJson.title,
            content: messageJson.content.join(""),
            valid:
              typeof messageJson.valid !== "undefined"
                ? messageJson.valid
                : null,
            expire:
              typeof messageJson.expire !== "undefined"
                ? messageJson.expire
                : null,
          };
          finalMessages.push(finalMessage);
        } catch (err) {
          console.log("Error when processing metadata. Message:", err);
        }
      });
      ret[hash] = { messages: finalMessages };
    }

    res.send(ret);
  };
