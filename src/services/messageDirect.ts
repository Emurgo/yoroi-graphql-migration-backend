import { Pool } from "pg";

import { Request, Response } from "express";

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

export const handleMessageDirect =
  (p: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.body.poolId) throw new Error("No poolId in body");
    if (!req.body.address) throw new Error("No address in body");

    const hash = req.body.poolId;
    const address = req.body.address; // stake_address !!!
    const fromBlock = req.body.fromBlock;
    const untilBlock = req.body.untilBlock;

    const ret: Dictionary<null | Message[]> = {};

    const queryMessageDirect = `
    SELECT
      b.block_no AS "block_no",
      json AS "message_json"
    FROM tx_metadata txm
      JOIN tx_out txo ON (txm.tx_id = txo.tx_id)
      JOIN tx tx ON (tx.id = txo.tx_id)
      JOIN block b ON (tx.block_id = b.id)
      JOIN stake_address sa ON (txo.stake_address_id = sa.id)
    WHERE tx.id IN (
        SELECT txo.tx_id
        FROM tx_metadata txm
          JOIN tx_out txo ON (txo.tx_id = txm.tx_id)
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
          AND txm.key = 1991
      )
      AND sa.view = $2
      AND (
        $3::INTEGER IS NULL
        OR b.block_no >= $3
      )
      AND (
        $4::INTEGER IS NULL
        OR b.block_no <= $4
      )
    ORDER BY tx.id DESC;
    `;

    const messagesDirect = await p.query(queryMessageDirect, [
      hash,
      address,
      fromBlock,
      untilBlock,
    ]);

    const finalMessages: Message[] = [];

    messagesDirect.rows.map(async (message) => {
      try {
        const messageJson = message.message_json;
        console.log(message);
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

    res.send(ret);
  };
