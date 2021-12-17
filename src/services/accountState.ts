import { assertNever, validateAddressesReq } from "../utils";

import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";

const addrReqLimit:number = config.get("server.addressRequestLimit");

const accountRewardsQuery = `
  with queried_addresses as (
    select *
    from stake_address
    where encode(stake_address.hash_raw, 'hex') = any(($1)::varchar array)
  )

  select queried_addresses.hash_raw as "stakeAddress"
      , sum(coalesce("totalReward".spendable_amount,0) - coalesce("totalWithdrawal".amount,0)) as "remainingAmount"
      , sum(coalesce("totalReward".non_spendable_amount,0)) as "remainingNonSpendableAmount"
      , sum(coalesce("totalReward".spendable_amount,0) + coalesce("totalReward".non_spendable_amount,0)) as "reward"
      , sum(coalesce("totalWithdrawal".amount, 0)) as "withdrawal"

  from queried_addresses

  left outer join (
    SELECT addr_id, sum(amount) as "amount"
    FROM withdrawal
    join queried_addresses withdrawal_stake_address
    on withdrawal_stake_address.id = withdrawal.addr_id
    GROUP BY
      addr_id
  ) as "totalWithdrawal" on queried_addresses.id = "totalWithdrawal".addr_id

  left outer join (
    SELECT addr_id,
      sum(case when "current_epoch".value >= spendable_epoch then amount else 0 end) as "spendable_amount",
      sum(case when "current_epoch".value < spendable_epoch then amount else 0 end) as "non_spendable_amount"
    FROM reward
    join queried_addresses reward_stake_address
    on reward_stake_address.id = reward.addr_id
    cross join (select max (epoch_no) as value from block) as "current_epoch"
    GROUP BY
      addr_id
  ) as "totalReward" on queried_addresses.id = "totalReward".addr_id

  group by queried_addresses.id, queried_addresses.hash_raw`;

interface RewardInfo {
  remainingAmount: string;
  remainingNonSpendableAmount: string;
  rewards: string;
  withdrawals: string;
  poolOperator: null;
  isRewardsOff?: boolean;
}

interface Dictionary<T> {
    [key: string]: T;
}

const getAccountStateFromDB = async (pool: Pool, addresses: string[]): Promise<Dictionary<RewardInfo|null>> => {
  const ret : Dictionary<RewardInfo|null> = {};
  const rewards = await pool.query(accountRewardsQuery, [addresses]);
  for(const row of rewards.rows) {
    ret[row.stakeAddress.toString("hex")] = {
        remainingAmount: row.remainingAmount
      , remainingNonSpendableAmount: row.remainingNonSpendableAmount
      , rewards: row.reward
      , withdrawals: row.withdrawal
      , poolOperator: null //not implemented
      , isRewardsOff: true
    };
  }
  for( const addr of addresses)
    if (!(addr in ret))
      ret[addr] = null;
  return ret;
};

export const handleGetAccountState = (pool: Pool) => async (req: Request, res:Response<Dictionary<RewardInfo | null>>): Promise<void> => {
  if(!req.body || !req.body.addresses) {
    throw new Error("no addresses.");
    return;
  } 
  const verifiedAddrs = validateAddressesReq(addrReqLimit, req.body.addresses);
  switch(verifiedAddrs.kind){
  case "ok": {
    const accountState = await getAccountStateFromDB(pool, verifiedAddrs.value);
    res.send(accountState); 
    return;
  }
  case "error":
    throw new Error(verifiedAddrs.errMsg);
    return;
  default: return assertNever(verifiedAddrs);
  }
};
