import { assertNever, Dictionary, HEX_REGEXP, validateAddressesReq } from "../utils";

import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";

const addrReqLimit:number = config.get("server.addressRequestLimit");

const regHistoryQuery = `
  select block.slot_no as "slotNo"
       , tx.block_index as "txIndex"
       , cc.cert_index as "certIndex" 
       , sa.hash_raw as "stakeCred"
       , 'StakeRegistration' as "certType"
  from stake_registration cc 
  join stake_address sa on cc.addr_id = sa.id 
  join tx on cc.tx_id = tx.id 
  join block on tx.block=block.id 
  where sa.hash_raw = any(($1)::bytea array) 
  union 
  select block.slot_no as "slotNo"
       , tx.block_index as "txIndex"
       , cc.cert_index as "certIndex" 
       , sa.hash_raw as "stakeCred"
       , 'StakeDeregistration' as "certType"
  from stake_deregistration cc 
  join stake_address sa on cc.addr_id = sa.id 
  join tx on cc.tx_id = tx.id join block on tx.block=block.id 
  where sa.hash_raw = any(($1)::bytea array) 
`;

interface Pointer {
    slot: number;
    txIndex: number;
    certIndex: number;
    certType: "StakeRegistration"|"StakeDeregistration";
}


const askRegHistory = async (pool: Pool, addresses: string[]): Promise<Dictionary<Pointer[]>> => {

  const stakeCred = addresses.filter((s:string)=>HEX_REGEXP.test(s)).map((s:string) => `\\x${s}`);
  const history = await pool.query(regHistoryQuery, [stakeCred]);
  const ret : Dictionary<Pointer[]> = {};
  for(const addr of addresses) {
    const pointers = history.rows.filter( (r:any) => r.stakeCred.toString("hex") === addr)
      .map( (r:any) => ({ slot: r.slotNo
        , txIndex: r.txIndex
        , certIndex: r.certIndex 
        , certType: r.certType}));

    ret[addr] = pointers;
  }
  return ret;
};

export const handleGetRegHistory = (pool: Pool) => async (req: Request, res:Response): Promise<void> => {
  if(!req.body || !req.body.addresses) {
    throw new Error("no addresses.");
    return;
  } 
  const verifiedAddrs = validateAddressesReq(addrReqLimit, req.body.addresses);
  switch(verifiedAddrs.kind){
  case "ok": {
    const history = await askRegHistory(pool, verifiedAddrs.value);
    res.send(history); 
    return;
  }
  case "error":
    throw new Error(verifiedAddrs.errMsg);
    return;
  default: return assertNever(verifiedAddrs);
  }
  

};
