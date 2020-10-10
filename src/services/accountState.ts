import { assertNever, validateAddressesReq } from "../utils";

import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";
import { Address } from "@emurgo/cardano-serialization-lib-nodejs";

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

const queryCardanoCli = async (address: string /* hex-encoded string */): Promise<null | {
  remainingAmount: string,
}> => {
  let bech32Addr;
  try {
    const wasmAddr = Address.from_bytes(Buffer.from(address, "hex"));
    bech32Addr = wasmAddr.to_bech32();
    wasmAddr.free();
  } catch (_e) {
    console.log(`invalid address ${address}`);
    return null;
  }
  const commandResult = await execShellCommand(`/var/lib/nginx/bin/stake-wrapper ${bech32Addr}`);
  // stake1uyznuh5q22uegen83m09d4wr8ahcp02aysz4yx6ht2d8zggtxc7m7 (empty)
  // stake1u8pcjgmx7962w6hey5hhsd502araxp26kdtgagakhaqtq8squng76 (not empty)
  // stake1uy4ntxtgap3ry4fqv6svhehnc4krsag6uk45tvz9af9ngcsjpl8sq (empty array result)
  const cardanoCliResponse: Array<{
    address: string, // bech32
    delegation: null | string, // bech32
    rewardAccountBalance: number, // cardano-cli returns this as a number even though it really shouldn't
  }> = JSON.parse(commandResult);

  if (cardanoCliResponse.length === 0) {
    return null;
  }
  return {
    remainingAmount: cardanoCliResponse[0].rewardAccountBalance.toString() // cardano-cli returns this as a number even though it really shouldn't
  };
};

const execShellCommand = (cmd: string): Promise<string> => {
  const exec = require("child_process").exec;
  return new Promise((resolve, reject) => {
    exec(cmd, (err: string, stdout: string, stderr: string) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout ? stdout : stderr);
    });
  });
};

const askAccountRewards = async (pool: Pool, addresses: string[]): Promise<Dictionary<RewardInfo|null>> => {
  const ret : Dictionary<RewardInfo|null> = {};
  for (const addr of addresses) {
    const result = await queryCardanoCli(addr);
    if (result == null) {
      ret[addr] = null;
      continue;
    }
    ret[addr] = {
      remainingAmount: result.remainingAmount,
      rewards: "", // not implemented yet
      withdrawals: "", // not implemented yet
      poolOperator: null, // not implemented yet
    };
  }
  return ret;
  // const rewards = await pool.query(accountRewardsQuery, [addresses]);
  // const ret : Dictionary<RewardInfo|null> = {};
  // for(const row of rewards.rows) {
  //   ret[row.stakeAddress.toString("hex")] = { remainingAmount: row.remainingAmount
  //     , rewards: row.reward
  //     , withdrawals: row.withdrawal
  //     , poolOperator: null //not implemented
  //   };
  // }
  // for( const addr of addresses)
  //   if (!(addr in ret))
  //     ret[addr] = null;
  // return ret;
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
