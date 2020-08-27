import { Pool } from "pg";
import { Request, Response } from "express";

import config from "config";
import { assertNever, isHex, UtilEither, validateAddressesReq } from "../utils";



const filterUsedQuery = `
  select ( select json_agg((address)) 
           from tx_out 
           where tx_id = outertx.tx_id) as outputs,
         ( select json_agg((address)) 
           from tx_out 
           join tx_in 
             on tx_in.tx_out_id = tx_out.tx_id 
            and tx_in.tx_out_index = tx_out.index 
           where tx_in_id = outertx.tx_id) as inputs
  from tx_out as outertx 
  where address = any(($1)::varchar array) 
     or payment_cred = any(($2)::bytea array)
`;

const resolveAddrQuery = `
  select json_agg((address)) as addrs
  from tx_out 
  where payment_cred = any(($1)::bytea array)
`;

const addressesRequestLimit:number = config.get("server.addressRequestLimit");

export const filterUsedAddresses = (pool : Pool) => async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
    throw new Error("no addresses in request body.");
    return;
  }
  const verifiedAddrs = validateAddressesReq(addressesRequestLimit, req.body.addresses);
  switch(verifiedAddrs.kind){
  case "ok": {
    const paymentCreds = verifiedAddrs.value.filter(isHex).map((s:string) => `\\x${s}`);
    const result = await pool.query(filterUsedQuery, [verifiedAddrs.value, paymentCreds]);
    const addrResult = await pool.query(resolveAddrQuery, [paymentCreds]);
    const extraAddr = addrResult.rows.length > 0 
      ?  addrResult.rows[0].addrs || []
      : [];
    const resultSet = new Set(result.rows.flatMap( tx => [tx.inputs, tx.outputs]).flat());
    const verifiedSet = new Set(verifiedAddrs.value.concat(extraAddr));
    const intersection = new Set();
    for (const elem of resultSet)
      if(verifiedSet.has(elem))
        intersection.add(elem);
    res.send([...intersection]);
    return;

  }
  case "error":
    throw new Error(verifiedAddrs.errMsg);
    return;
  default: return assertNever(verifiedAddrs);
  }
};
