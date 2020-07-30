import axios from "axios";
import { Request, Response } from "express";

import { contentTypeHeaders } from "../utils";

import { SignedTransaction } from "cardano-wallet";

const submissionEndpoint = "https://adalite.io/api/txs/submit";

interface SubmissionData {
    txHash: string;
    txBody: string;

}

export const handleSignedTx = async (req: Request, res: Response):Promise<void>=> { 
  if(!req.body.signedTx)
    throw new Error ("No signedTx in body");

  const buffer = Buffer.from(req.body.signedTx, "base64");
  const txHash = (() => {
    const tx = SignedTransaction.from_bytes(buffer);
    const txHash = tx.id();
    tx.free();
    return txHash;
  })();

  const submission : SubmissionData = { txHash: txHash
    , txBody: buffer.toString("hex")
  };
  const endpointResponse = await axios.post(submissionEndpoint, JSON.stringify(submission), contentTypeHeaders);

  if(endpointResponse.status === 200){
    if(endpointResponse.data.Left)
      throw Error(`Error tyrying to send transaction: ${endpointResponse.data.Left}`);
    res.send([]);
    return;
  }
  
  throw new Error(`Error trying to send transaction: ${endpointResponse.data}`);

};
