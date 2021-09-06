import { assertNever, validateAddressesReq } from "../utils";

import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";

const addrReqLimit:number = config.get("server.addressRequestLimit");

const accountRewardsQuery = `
  select stake_address.hash_raw as "stakeAddress"
       , sum(coalesce("totalMir".amount, 0) - coalesce("totalWithdrawal".amount,0) + coalesce("totalReward".amount,0)) as "remainingAmount"
       , sum(coalesce("totalMir".amount, 0) + coalesce("totalReward".amount,0)) as "reward"
       , sum(coalesce("totalWithdrawal".amount, 0)) as "withdrawal"

  from stake_address

  left outer join (
    select addr_id, sum(amount) as "amount"
    from (
        SELECT distinct on (mirs.addr_id, block.epoch_no) mirs.addr_id, block.epoch_no, block.slot_no, mirs.amount
        from (
            select * from (
                select * from treasury
                union all 
                select * from reserve
            ) all_mirs
            JOIN stake_address a ON all_mirs.addr_id = a.id
            WHERE encode(a.hash_raw, 'hex') = any(($1)::varchar array)
        ) as mirs
        join tx on mirs.tx_id = tx.id
        join block on tx.block_id = block.id
        order by mirs.addr_id, block.epoch_no desc, block.slot_no desc 
    ) epoched_mirs
    group by addr_id
  ) as "totalMir" on stake_address.id = "totalMir".addr_id
      
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
