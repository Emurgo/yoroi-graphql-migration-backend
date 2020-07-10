import axios from 'axios';
import { Request, Response } from "express";

import { assertNever, contentTypeHeaders, errMsgs, graphqlEndpoint, UtilEither} from "../utils";

const submissionEndpoint = 'https://adalite.io/api/txs/submit';

interface SubmissionData {
    txHash: string;
    txBody: string;

};

export const handleSignedTx = async (req: Request, res: Response) => { 
  if(!req.body.signedTx)
      throw new Error ("No signedTx in body");
  const submission : SubmissionData = { txHash: req.body.signedTx
                                      , txBody: req.body.signedTx // this is silly, but what should it be?
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
