import config from "config";
import axios from "axios";
import { Pool } from "pg";
import { Request, Response } from "express";

import { rowToCertificate, Certificate} from "../Transactions/types";
const submissionEndpoint :string = config.get("server.smashEndpoint");

const addressesRequestLimit:number = config.get("server.addressRequestLimit");

interface Dictionary<T> {
  [keys: string]: T;
}
interface RemotePool {
    info: any; // this comes from smash.  we don't edit it.
    history: PoolHistory[];
}

interface PoolHistory {
    epoch: number;
    slot: number;
    tx_ordinal: number
    cert_ordinal: number;
    payload: Certificate | null; 
}

const latestMetadataQuery = `
  select encode(pool_meta_data.hash, 'hex')
     from pool_hash
     join pool_update 
          on pool_hash.id = pool_update.hash_id 
     join pool_meta_data 
          on pool_update.meta = pool_meta_data.id
     where encode(pool_hash.hash, 'hex') = $1
    order by pool_update.id desc limit 1;
`;

const poolHistoryQuery = `
  select row_to_json(combined_certificates) as "jsonCert"
       , block.epoch_no
       , block.epoch_slot_no
       , tx.block_index as tx_index
       , combined_certificates."certIndex"
  from combined_certificates
  join tx
    on tx.id = combined_certificates."txId"
  join block
    on block.id = tx.block
  where "poolHashKey" = $1;
`;

export const handlePoolInfo = (p: Pool) => async (req: Request, res: Response):Promise<void>=> { 
  if(!req.body.poolMetaDataHashes)
    throw new Error ("No poolIds in body");
  const hashes = req.body.poolIds;

  if(!(hashes instanceof Array) || hashes.length > addressesRequestLimit)
    throw new Error (` poolIds must have between 0 and ${addressesRequestLimit} items`);
   
  const ret:Dictionary<any> = {};

  for (const hash of hashes) {
    if(hash.length !== 56){
      throw new Error(`Received invalid pool id: ${hash}`);
    }
    const metadataHashResp = await p.query(poolHistoryQuery, [latestMetadataQuery]);
    if (metadataHashResp.rows.length === 0) {
      ret[hash] = null;
      continue;
    }
    const metadataHash = metadataHashResp.rows[0];


    let info = {};
    try {
      const endpointResponse = await axios.get(submissionEndpoint+metadataHash); 
      if(endpointResponse.status === 200){
        info = endpointResponse.data;
      }else{
        console.log(`SMASH did not respond to user submitted hash: ${hash}`);
      }} catch(e) {
      console.log(`SMASH did not respond with hash ${hash}, giving error ${e}`);
    }

    const dbHistory = await p.query(poolHistoryQuery, [metadataHash]);

    const history = dbHistory.rows.map( (row: any) => ({
      epoch: row.epoch_no
      , slot: row.epoch_slot_no
      , tx_ordinal: row.tx_index
      , cert_ordinal: row.certIndex
      , payload: rowToCertificate(row.jsonCert)
    }));
    ret[hash] = {
      info: info,
      history: history
    };
  }

  res.send(ret);
  return; 

};

