import { assertNever, validateAddressesReq } from "../utils";

import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";

const addrReqLimit:number = config.get("server.addressRequestLimit");

const accountRewardsQuery = `
  select addr.hash as "stakeAddress"
       , sum(reserve.amount - coalesce(withdrawal.amount,0)) as "remainingAmount"
       , sum(reserve.amount) as "reward"
       , sum(coalesce(withdrawal.amount, 0)) as "withdrawal"
  from reserve
  join stake_address as addr on addr.id = reserve.addr_id
  left outer join withdrawal on addr.id = withdrawal.addr_id
  where encode(addr.hash, 'hex') = any(($1)::varchar array)
  group by addr.hash
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
  const rewards = await pool.query(accountRewardsQuery, [addresses]);
  const ret : Dictionary<RewardInfo|null> = {};
  for(const row of rewards.rows) {
    ret[row.stakeAddress.toString("hex")] = { remainingAmount: row.remainingAmount
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
