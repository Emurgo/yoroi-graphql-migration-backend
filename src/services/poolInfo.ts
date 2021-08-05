import config from "config";
import axios from "axios";
import { Pool, QueryResult } from "pg";
import { Request, Response } from "express";

import { rowToCertificate, Certificate} from "../Transactions/types";
const smashEndpoint :string = config.get("server.smashEndpoint");

const addressesRequestLimit:number = config.get("server.addressRequestLimit");

interface Dictionary<T> {
  [keys: string]: T;
}

export interface RemotePool {
    info: any; // this comes from smash.  we don't edit it.
    history: PoolHistory[];
}

export interface PoolHistory {
    epoch: number;
    slot: number;
    tx_ordinal: number
    cert_ordinal: number;
    payload: Certificate | null; 
}

export const latestMetadataQuery = `
  select encode(pool_meta_data.hash, 'hex') as "metadata_hash"
     from pool_hash
     join pool_update 
          on pool_hash.id = pool_update.hash_id 
     join pool_meta_data 
          on pool_update.meta_id = pool_meta_data.id
     where encode(pool_hash.hash_raw, 'hex') = $1
    order by pool_update.id desc limit 1;
`;

export const poolHistoryQuery = `
  select row_to_json(combined_certificates) as "jsonCert"
       , block.epoch_no
       , block.epoch_slot_no
       , tx.block_index as tx_index
       , combined_certificates."certIndex"
  from combined_certificates
  join tx
    on tx.id = combined_certificates."txId"
  join block
    on block.id = tx.block_id
  where "poolHashKey" = $1
    and ("jsType" = 'PoolRegistration' or "jsType" = 'PoolRetirement');
`;

export interface SmashLookUpResponse {
  metadataHash: string | null,
  smashInfo: any,
}

export const smashPoolLookUp = async (p: Pool, hash: string): Promise<SmashLookUpResponse> => {
  const metadataHashResp = await p.query(latestMetadataQuery, [hash]);
  if (metadataHashResp.rows.length === 0) {
    return {
      metadataHash: null,
      smashInfo: null,
    };
  }

  const metadataHash = metadataHashResp.rows[0].metadata_hash;

  try {
    const endpointResponse = await axios.get(`${smashEndpoint}${hash}/${metadataHash}`);
    if(endpointResponse.status === 200) {
      return {
        metadataHash: metadataHash,
        smashInfo: endpointResponse.data,
      };
    } else {
      console.log(`SMASH did not respond to user submitted hash: ${hash}`);
    }
  } catch(e) {
    console.log(`SMASH did not respond with hash ${hash}, giving error ${e}`);
  }

  return {
    metadataHash: metadataHash,
    smashInfo: {},
  };
};

export const handlePoolInfo = (p: Pool) => async (req: Request, res: Response): Promise<void> => {
  if(!req.body.poolIds)
    throw new Error ("No poolIds in body");
  const hashes = req.body.poolIds;

  if(!(hashes instanceof Array) || hashes.length > addressesRequestLimit)
    throw new Error (` poolIds must have between 0 and ${addressesRequestLimit} items`);
   
  const ret:Dictionary<null | RemotePool> = {};

  for (const hash of hashes) {
    if(hash.length !== 56){
      throw new Error(`Received invalid pool id: ${hash}`);
    }

    const smashPoolResponse = await smashPoolLookUp(p, hash);
    if (smashPoolResponse.metadataHash == null) {
      ret[hash] = null;
      continue;
    }
    const info = smashPoolResponse.smashInfo;

    const dbHistory = await p.query(poolHistoryQuery, [hash]);
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

const QUERY_POOL_SQL = `
  SELECT hash 
  FROM pool
  ORDER BY hash
  LIMIT ${addressesRequestLimit}
  OFFSET $2
`;

export const queryPools = async (p: Pool, offset = 0): Promise<QueryResult<Array<any>>> => {
  return p.query(QUERY_POOL_SQL, [offset]);
};

export const handleGetPools = (p: Pool) => async (req: Request, res: Response): Promise<void> => {

  const ret:Dictionary<null | RemotePool> = {};

  const offset = req.query ? Number(req.query.offset) : 0;
  const hashes = await queryPools(p, offset);

  await Promise.all(hashes.rows.map(async ({ hash }: any) => {
    const smashPoolResponse = await smashPoolLookUp(p, hash);
    if (smashPoolResponse.metadataHash == null) {
      ret[hash] = null;
      return;
    }
    const info = smashPoolResponse.smashInfo;

    const dbHistory = await p.query(poolHistoryQuery, [hash]);
    const history = dbHistory.rows.map((row: any) => ({
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
  }));

  res.send(ret);
  return; 

};

