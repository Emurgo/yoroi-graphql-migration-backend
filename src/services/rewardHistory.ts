import { assertNever, Dictionary, HEX_REGEXP, validateAddressesReq } from "../utils";

import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";

const addrReqLimit:number = config.get("server.addressRequestLimit");

const rewardHistoryQuery = `
  select
      reward.amount
    , reward.epoch_no
    , sa.hash_raw as "stakeCred"
  from reward 
  join stake_address sa on reward.addr_id = sa.id 
  where sa.hash_raw = any(($1)::bytea array) 
`;

interface RewardForEpoch {
  epoch: number;
  reward: string;
}

const askRewardHistory = async (pool: Pool, addresses: string[]): Promise<Dictionary<RewardForEpoch[]>> => {

  const stakeCred = addresses.filter((s:string)=>HEX_REGEXP.test(s)).map((s:string) => `\\x${s}`);
  const history = await pool.query(rewardHistoryQuery, [stakeCred]);
  const ret : Dictionary<RewardForEpoch[]> = {};
  for(const addr of addresses) {
    const rewardPairs: RewardForEpoch[] = history.rows
      .filter( (r:any) => r.stakeCred.toString("hex") === addr)
      .map( (r:any) => ({
        epoch: Number.parseInt(r.epoch_no, 10),
        reward: r.amount
      }));

    ret[addr] = rewardPairs;
  }
  return ret;
};

export const handleGetRewardHistory = (pool: Pool) => async (req: Request, res:Response): Promise<void> => {
  if(!req.body || !req.body.addresses) {
    throw new Error("no addresses.");
    return;
  } 
  const verifiedAddrs = validateAddressesReq(addrReqLimit, req.body.addresses);
  switch(verifiedAddrs.kind){
  case "ok": {
    const history = await askRewardHistory(pool, verifiedAddrs.value);
    res.send(history); 
    return;
  }
  case "error":
    throw new Error(verifiedAddrs.errMsg);
    return;
  default: return assertNever(verifiedAddrs);
  }
};
