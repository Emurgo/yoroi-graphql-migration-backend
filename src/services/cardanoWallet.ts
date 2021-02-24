import { UtilEither } from "../utils";

import { Pool } from "pg";
import { Request, Response } from "express";
import * as utils from "../utils";

const poolByRewards = `
    select *
    from cardano_wallet
    order by non_myopic_member_rewards::int desc
    limit $1
    offset $2
`;

export interface CardanoWalletPool {
    pool_id: string,
    cost: string,
    margin: string,
    pledge: string,
    non_myopic_member_rewards: number,
    produced_blocks: number,
    relative_stake: string
}

export const getCardanoWalletPools = async (pool: Pool, limit: number, offset: number): Promise<UtilEither<Array<CardanoWalletPool>>> => {
    try {
        const res = await pool.query(poolByRewards, [limit, offset]);
        return {
            kind: "ok",
            value: res.rows
        }
    } catch (err) {
        const errString = err.stack + "";
        return { kind:"error", errMsg: "handleGetCardanoWalletPools error: " + errString };
    }
}

export const handleGetCardanoWalletPools = (pool: Pool) => async (req: Request, res: Response): Promise<void> => {
    let limit = 100;
    if (req.body.limit != null && req.body.limit < limit) {
        limit = req.body.limit;
    }

    let offset = 0;
    if (req.body.offset != null && req.body.offset > 0) {
        offset = req.body.offset;
    }

    const result = await getCardanoWalletPools(pool, limit, offset);

    switch (result.kind) {
        case "ok": {
            res.send(result);
            break;
        }
        case "error": {
            throw new Error(result.errMsg);
        }

        default:
            return utils.assertNever(result);
    }
}