import axios from "axios";
import { Request, Response } from "express";


import { SignedTransaction } from "cardano-wallet";

const submissionEndpoint = "https://backend.yoroiwallet.com/api/submit/tx";

const contentTypeHeaders = {"Content-Type": "application/cbor"};


export const handleSignedTx = async (req: Request, res: Response):Promise<void>=> { 
  if(!req.body.signedTx)
    throw new Error ("No signedTx in body");

  const buffer = Buffer.from(req.body.signedTx, "base64");
  try {
    const endpointResponse = await axios({ method:"post"
      , url: submissionEndpoint
      , data: buffer
      , headers: contentTypeHeaders}); 
    if(endpointResponse.status === 202){
      if(endpointResponse.data.Left){
        const msg = `Transaction was rejected: ${endpointResponse.data.Left}`;
        throw Error(msg);
      }
      res.send([]);
      return;
    }
  } catch(error) {
    const msg = `Error trying to send transaction: ${error} - ${error.response.data}`;
    throw Error(msg);
  }

};
