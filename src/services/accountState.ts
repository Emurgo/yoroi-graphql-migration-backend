import {assertNever, validateAddressesReq, webhookToSlack} from "../utils";

import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";
import {YoroiGeneralCache} from "../Transactions/types";

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

const askAccountRewards = async (pool: Pool, addresses: string[]): Promise<Dictionary<RewardInfo | null>> => {
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

interface AccountStateCacheValue extends RewardInfo {
  lastUpdated: Date
}

interface AccountStateCache {
  [account: string]: AccountStateCacheValue
}

export const handleGetAccountState = (pool: Pool, yoroiCache: YoroiGeneralCache) => async (req: Request, res:Response): Promise<void> => {
  if(!req.body || !req.body.addresses) {
    throw new Error("no addresses.");
  }

  const verifiedAddrs = validateAddressesReq(addrReqLimit, req.body.addresses);
  switch (verifiedAddrs.kind) {
  case "ok": {
    let cachedStates: AccountStateCache = {};

    if (yoroiCache.isGeneralCacheActive) {
      for (const account of verifiedAddrs.value) {
        const accountCachedState: AccountStateCacheValue = await yoroiCache.accountStateLruCache.get(account);
        if (accountCachedState) {
          cachedStates[account] = accountCachedState;
        }
      }

      if (!Object.values(cachedStates).some(e => (e == null)) && Object.values(cachedStates).length == verifiedAddrs.value.length) {
        console.log("handleGetAccountState:: Using cached prices")
        console.log(cachedStates)

        if (!yoroiCache.isGeneralCacheValidationEnforced) {
          res.send(cachedStates);
          return;
        }
      }
    }
    const accountState = await askAccountRewards(pool, verifiedAddrs.value);
    console.log("handleGetAccountState:: response")
    console.log(accountState)

    // Update Cache
    if (yoroiCache.isGeneralCacheActive) {
      console.log("handleGetAccountState:: Updating cached prices")
      for (const addr of verifiedAddrs.value) {
        const storeObj = {
          ...accountState[addr],
          lastUpdated: new Date()
        }

        await yoroiCache.accountStateLruCache.set(addr, storeObj);
      }
    }

    // Check Enforcement
    if (yoroiCache.isGeneralCacheValidationEnforced && yoroiCache.accountStateLruCache.count !== 0) {
      let doesMatch = true;
      for (const addr of verifiedAddrs.value) {
        if (
            cachedStates[addr] == null ||
            cachedStates[addr].remainingAmount !== accountState[addr]!.remainingAmount ||
            cachedStates[addr].poolOperator !== accountState[addr]!.poolOperator ||
            cachedStates[addr].rewards !== accountState[addr]!.rewards ||
            cachedStates[addr].withdrawals !== accountState[addr]!.withdrawals
        ) {
          doesMatch = false;
          break;
        }
      }
      if (doesMatch) {
        console.log("handleGetAccountState:: CacheValidationEnforced OK")
      }
      else {
        const logObj = {
          "request": req.body,
          "cache": cachedStates,
          "db": accountState,
        }
        console.log("handleGetAccountState:: CacheValidationEnforced does not match")
        console.log(logObj)

        // we don't care about waiting to get resolved
        const _ = webhookToSlack(logObj, yoroiCache.slackUrl);
      }
    }

    res.send(accountState); 
    break;
  }

  case "error":
    throw new Error(verifiedAddrs.errMsg);

  default:
    return assertNever(verifiedAddrs);
  }
};
