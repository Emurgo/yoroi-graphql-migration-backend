import config from "config";

import { Pool } from "pg";
import { Request, Response } from "express";

import { CardanoFrag } from "../Transactions/types";

const safeBlockQuery = `SELECT epoch_no AS "epoch",
    epoch_slot_no AS "slot",
    encode(hash, 'hex') as hash,
    block_no AS height
FROM BLOCK
WHERE block_no <= (SELECT MAX(block_no) FROM block) - ($1)::int
ORDER BY id DESC
LIMIT 1;
`;

export const handleSafeBlock = (pool: Pool) => async (req: Request, res: Response) => {
    const safeBlockDifference = parseInt(config.get("safeBlockDifference"));

    const result = await pool.query(safeBlockQuery, [safeBlockDifference]);
    if (result.rowCount === 0) throw new Error("no blocks found!");

    const row = result.rows[0];

    const safeBlock: CardanoFrag = {
        epoch: row.epoch,
        slot: row.slot,
        hash: row.hash,
        height: row.height
    };

    res.send(safeBlock);
};