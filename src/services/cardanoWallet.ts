import { UtilEither } from "../utils";

import { Pool } from "pg";
import { Request, Response } from "express";
import * as utils from "../utils";
import { smashPoolLookUp } from "./poolInfo";

const poolByRewards = `
    select pool_id, cost, margin, pledge, saturation, non_myopic_member_rewards::int, produced_blocks::int, relative_stake
    from cardano_wallet
    order by non_myopic_member_rewards::int desc
    limit $1
    offset $2
`;

export interface CardanoWalletPool {
  pool_id: string;
  pool_info: any;
  cost: string;
  margin: string;
  pledge: string;
  non_myopic_member_rewards: number;
  produced_blocks: number;
  relative_stake: string;
}

export const getCardanoWalletPools = async (
  pool: Pool,
  limit: number,
  offset: number
): Promise<UtilEither<Array<CardanoWalletPool>>> => {
  try {
    const res = await pool.query(poolByRewards, [limit, offset]);
    return {
      kind: "ok",
      value: res.rows,
    };
  } catch (err: any) {
    const errString = err.stack + "";
    return {
      kind: "error",
      errMsg: "handleGetCardanoWalletPools error: " + errString,
    };
  }
};

export const handleGetCardanoWalletPools =
  (pool: Pool) =>
  async (req: Request, res: Response<CardanoWalletPool[]>): Promise<void> => {
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
        const promisesWithPoolInfo = result.value.map(
          async (walletPoolInfo) => {
            const pool_info = await smashPoolLookUp(
              pool,
              walletPoolInfo.pool_id
            );
            return {
              ...walletPoolInfo,
              pool_info: pool_info.smashInfo,
            };
          }
        );

        const respWithPoolInfo = await Promise.all(promisesWithPoolInfo);

        res.send(respWithPoolInfo);
        break;
      }
      case "error": {
        throw new Error(result.errMsg);
      }

      default:
        return utils.assertNever(result);
    }
  };
