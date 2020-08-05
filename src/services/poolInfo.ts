import config from "config";
import axios from "axios";
import { Request, Response } from "express";

const submissionEndpoint :string = config.get("server.smashEndpoint");

const addressesRequestLimit:number = config.get("server.addressRequestLimit");

interface Dictionary<T> {
  [keys: string]: T;
}

export const handlePoolInfo = async (req: Request, res: Response):Promise<void>=> { 
  if(!req.body.poolMetaDataHashes)
    throw new Error ("No poolMetaDataHashes in body");
  const hashes = req.body.poolMetaDataHashes;

  if(!(hashes instanceof Array) || hashes.length > addressesRequestLimit)
    throw new Error (` poolMetaDataHashes must have between 0 and ${addressesRequestLimit} items`);
   
  const ret:Dictionary<any> = {};
  for (const hash of hashes) {
    if(hash.length !== 64){
      console.log(`Recieved invalid pool metadata hash for SMASH: ${hash}`);
      continue;
    }
    try {
      const endpointResponse = await axios.get(submissionEndpoint+hash); 
      if(endpointResponse.status === 200){
        ret[hash] = endpointResponse.data;
      }else{
        ret[hash] = null;
        console.log(`SMASH did not respond to user submitted hash: ${hash}`);
      }} catch(e) {
      console.log(e);
      ret[hash] = null;

    }
  }

  res.send(ret);
  return; 

};

