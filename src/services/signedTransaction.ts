import config from "config";
import axios from "axios";
import { Request, Response } from "express";

const submissionEndpoint :string = config.get("server.txSubmissionEndpoint");

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
    }else{
      throw Error(`I did not understand the response from the submission endpoint: ${endpointResponse.data}`);
    }
  } catch(error) {
    const msg = `Error trying to send transaction: ${error} - ${error.response.data}`;
    throw Error(msg);
  }

};
