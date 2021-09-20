import { Pool } from "pg";
import { Request, Response } from "express";
import config from "config";

const addressesRequestLimit: number = config.get("server.addressRequestLimit");
export interface Message {
  [key: string]: {
    block_no: number;
    title: string;
    content: string;
    valid: number | null;
    expire: number | null;
  };
}

export interface MessageJson {
  [key: string]: {
    title: string;
    content: string[];
    valid: number | null;
    expire: number | null;
  };
}

interface Dictionary<T> {
  [keys: string]: T;
}

export const handleMessageBoard =
  (p: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.body.poolIds) throw new Error("No poolIds in body");
    const hashes = req.body.poolIds;

    if (
      !(hashes instanceof Array) ||
      hashes.length > addressesRequestLimit ||
      hashes.length === 0
    )
      throw new Error(
        `poolIds must have between 1 and ${addressesRequestLimit} items`
      );

    const fromBlock = req.body.fromBlock;
    const untilBlock = req.body.untilBlock;

    const ret: Dictionary<null | Message[]> = {};

    if (hashes.some((h) => h.length !== 56)) {
      throw new Error("There was an invalid pool id in the poolIds");
    }

    for (const hash of hashes) {
      const queryMessageBoard = `
      WITH queried_pool_address AS (
        SELECT sa.id
        FROM pool_owner po
          JOIN pool_hash ph ON (po.pool_hash_id = ph.id)
          JOIN stake_address sa ON (sa.id = po.addr_id)
        WHERE po.registered_tx_id = (
            SELECT MAX(registered_tx_id)
            FROM pool_owner po
              JOIN pool_hash ph ON (po.pool_hash_id = ph.id)
            WHERE encode(ph.hash_raw, 'hex') = $1
          )
      )
      SELECT block_no, message_json
      FROM (
          SELECT *
          FROM (
              SELECT b.block_no AS "block_no",
                txm.json AS "message_json",
                tx.id AS "id"
              FROM tx_metadata txm
                JOIN tx ON (txm.tx_id = tx.id)
                JOIN block b ON (tx.block_id = b.id)
                JOIN tx_out txo ON (txm.tx_id = txo.tx_id)
                JOIN tx_in txi ON (txi.tx_in_id = tx.id)
                JOIN tx_out txo2 ON (
                  txo2.tx_id = txi.tx_out_id
                  AND txo2.index = txi.tx_out_index
                )
              WHERE txo.stake_address_id IN (
                  SELECT *
                  FROM queried_pool_address
                )
                AND txo2.stake_address_id IN (
                  SELECT *
                  FROM queried_pool_address
                )
                AND (
                  $2::INTEGER IS NULL
                  OR b.block_no >= $2
                )
                AND (
                  $3::INTEGER IS NULL
                  OR b.block_no <= $3
                )
                AND txm.key = 1990
            ) AS "txs"
          WHERE (
              (
                -- Handles cases when a tx also includes pool's change address
                -- SELECT only those transactions that have a single stake address
                -- In other words, this removes all txs that include more than one
                -- stake address as this is surely not a board message
                -- (sent from own address to own address)

                SELECT COUNT(DISTINCT txo.stake_address_id)
                FROM tx
                  JOIN tx_out txo ON (
                    tx.id = txo.tx_id
                    AND tx.id = txs.id
                  )
              ) = 1
            )
        ) AS "txs_unique"
      WHERE (
          SELECT CASE
              WHEN txs_unique IS NULL THEN null
              ELSE txo.stake_address_id
            END
          FROM tx
            JOIN tx_out txo ON (
              tx.id = txo.tx_id
              AND tx.id = txs_unique.id
            )
        ) = (
          SELECT *
          FROM queried_pool_address
        )
      ORDER BY id DESC;
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

          messageJson.map((perLanguageMessage: MessageJson) => {
            const lang = Object.keys(perLanguageMessage)[0];

            if (
              typeof perLanguageMessage[lang].title === "undefined" ||
              typeof perLanguageMessage[lang].content === "undefined"
            ) {
              // if the data is malformed (missing title or content), do not return anything
              return;
            }

            // if optional parameters are missing, fill them with nulls
            const finalMessage = {
              block_no: message.block_no,
              title: perLanguageMessage[lang].title,
              content: perLanguageMessage[lang].content.join(""),
              valid:
                typeof perLanguageMessage[lang].valid !== "undefined"
                  ? perLanguageMessage[lang].valid
                  : null,
              expire:
                typeof perLanguageMessage[lang].expire !== "undefined"
                  ? perLanguageMessage[lang].expire
                  : null,
            };
            finalMessages.push({ [lang]: finalMessage });
          });
        } catch (err) {
          console.log("Error when processing metadata. Message:", err);
        }
      });
      ret[hash] = finalMessages;
    }

    res.send(ret);
  };
