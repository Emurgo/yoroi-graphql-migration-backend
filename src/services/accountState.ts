import { assertNever, validateAddressesReq } from "../utils";

import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";

const addrReqLimit:number = config.get("server.addressRequestLimit");

const currentEpochQuery = 'select max (epoch_no) as epoch from block';

// parameters:
// $1: the array of addresses being queried
// $2: the last epoch in which MIRs issued are redeemable (i.e. MIRs after this
//     epoch is not yet redeemable)
const accountRewardsQuery = `
  select stake_address.hash_raw as "stakeAddress"
       , sum(coalesce("totalTreasury".amount, 0) + coalesce("totalReserve".amount, 0) - coalesce("totalWithdrawal".amount,0) + coalesce("totalReward".amount,0)) as "remainingAmount"
       , sum(coalesce("totalTreasury".amount, 0) + coalesce("totalReserve".amount, 0) + coalesce("totalReward".amount,0)) as "reward"
       , sum(coalesce("totalWithdrawal".amount, 0)) as "withdrawal"
       , sum(coalesce("totalTreasury".unredeemable, 0) + coalesce("totalReserve".unredeemable, 0)) as "unreemdable"

  from stake_address

  left outer join (
    ${/* this comes from MIR certificates */""}
    SELECT
      addr_id,
      sum(CASE WHEN block.epoch_no <= $2 THEN amount ELSE 0 END) as "amount",
      sum(CASE WHEN block.epoch_no > $2 THEN amount ELSE 0 END) as "unredeemable"
    FROM reserve
    JOIN stake_address reserve_stake_address
    ON reserve_stake_address.id = reserve.addr_id
    JOIN tx ON tx.id = reserve.tx_id
    JOIN block ON block.id = tx.block_id
    WHERE encode(reserve_stake_address.hash_raw, 'hex') = any(($1)::varchar array) 
    GROUP BY
      addr_id
  ) as "totalReserve" on stake_address.id = "totalReserve".addr_id

  left outer join (
    ${/* this comes from MIR certificates */""}
    SELECT
      addr_id,
      sum(CASE WHEN block.epoch_no <= $2 THEN amount ELSE 0 END) as "amount",
      sum(CASE WHEN block.epoch_no > $2 THEN amount ELSE 0 END) as "unredeemable"
    FROM treasury
    join stake_address treasury_stake_address
    on treasury_stake_address.id = treasury.addr_id
    JOIN tx ON tx.id = treasury.tx_id
    JOIN block ON block.id = tx.block_id
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
  unredeemable: string;
}

interface Dictionary<T> {
    [key: string]: T;
}

// After this number of epochs the MIR becomes redeemable
const NUMBER_OF_EPOCHS_TO_REDEEM_MIR = 1;

const askAccountRewards = async (pool: Pool, addresses: string[]): Promise<Dictionary<RewardInfo|null>> => {
  const currentEpochQueryResult = await pool.query(currentEpochQuery);
  if (currentEpochQueryResult.rows.length !== 1) {
    throw new Error('failed to get current epoch');
  }
  const currentEpoch = currentEpochQueryResult.rows[0].epoch;

  const ret : Dictionary<RewardInfo|null> = {};
  const rewards = await pool.query(
    accountRewardsQuery,
    [addresses, currentEpoch - NUMBER_OF_EPOCHS_TO_REDEEM_MIR],
  );
  for(const row of rewards.rows) {
    ret[row.stakeAddress.toString("hex")] = {
        remainingAmount: row.remainingAmount
      , rewards: row.reward
      , withdrawals: row.withdrawal
      , poolOperator: null //not implemented
      , unredeemable: row.unredeemable
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
