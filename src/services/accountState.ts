import { assertNever, validateAddressesReq } from "../utils";

import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";

const addrReqLimit:number = config.get("server.addressRequestLimit");

const accountRewardsQuery = `
  select stake_address.hash_raw as "stakeAddress"
       , sum(coalesce("totalTreasury".amount, 0) + coalesce("totalReserve".amount, 0) - coalesce("totalWithdrawal".amount,0) + coalesce("totalReward".amount,0)) as "remainingAmount"
       , sum(coalesce("totalTreasury".amount, 0) + coalesce("totalReserve".amount, 0) + coalesce("totalReward".amount,0)) as "reward"
       , sum(coalesce("totalWithdrawal".amount, 0)) as "withdrawal"

  from stake_address

  left outer join (
    ${/* this comes from MIR certificates */""}
    SELECT addr_id, sum(amount) as "amount"
    FROM reserve
    JOIN stake_address reserve_stake_address
    ON reserve_stake_address.id = reserve.addr_id
    WHERE encode(reserve_stake_address.hash_raw, 'hex') = any(($1)::varchar array) 
    GROUP BY
      addr_id
  ) as "totalReserve" on stake_address.id = "totalReserve".addr_id

  left outer join (
    ${/* this comes from MIR certificates */""}
    SELECT addr_id, sum(amount) as "amount"
    FROM treasury
    join stake_address treasury_stake_address
    on treasury_stake_address.id = treasury.addr_id
    where encode(treasury_stake_address.hash_raw, 'hex') = any(($1)::varchar array) 
    GROUP BY
      addr_id
  ) as "totalTreasury" on stake_address.id = "totalTreasury".addr_id

  left outer join (
    SELECT addr_id, sum(amount) as "amount"
    FROM withdrawal
    join stake_address withdrawal_stake_address
    on withdrawal_stake_address.id = withdrawal.addr_id
    where encode(withdrawal_stake_address.hash_raw, 'hex') = any(($1)::varchar array)    
    GROUP BY
	    addr_id
  ) as "totalWithdrawal" on stake_address.id = "totalWithdrawal".addr_id

  left outer join (
    SELECT addr_id, sum(amount) as "amount"
    FROM reward
    join stake_address reward_stake_address
    on reward_stake_address.id = reward.addr_id
    where encode(reward_stake_address.hash_raw, 'hex') = any(($1)::varchar array) 
    GROUP BY
	    addr_id
  ) as "totalReward" on stake_address.id = "totalReward".addr_id

  where encode(stake_address.hash_raw, 'hex') = any(($1)::varchar array)

  group by stake_address.id
`;

interface RewardInfo {
  remainingAmount: string;
  rewards: string;
  withdrawals: string;
  poolOperator: null;
}

interface Dictionary<T> {
    [key: string]: T;
}

const askAccountRewards = async (pool: Pool, addresses: string[]): Promise<Dictionary<RewardInfo|null>> => {
  const ret : Dictionary<RewardInfo|null> = {};
  const rewards = await pool.query(accountRewardsQuery, [addresses]);
  for(const row of rewards.rows) {
    ret[row.stakeAddress.toString("hex")] = {
        remainingAmount: row.remainingAmount
      , rewards: row.reward
      , withdrawals: row.withdrawal
      , poolOperator: null //not implemented
    };
  }
  for( const addr of addresses)
    if (!(addr in ret))
      ret[addr] = null;
  return ret;
};

export const handleGetAccountState = (pool: Pool) => async (req: Request, res:Response): Promise<void> => {
  if(!req.body || !req.body.addresses) {
    throw new Error("no addresses.");
    return;
  } 
  const verifiedAddrs = validateAddressesReq(addrReqLimit, req.body.addresses);
  switch(verifiedAddrs.kind){
  case "ok": {
    const accountState = await askAccountRewards(pool, verifiedAddrs.value);
    res.send(accountState); 
    return;
  }
  case "error":
    throw new Error(verifiedAddrs.errMsg);
    return;
  default: return assertNever(verifiedAddrs);
  }
};
