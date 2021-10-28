import config from "config";
import axios from "axios";
import { Request, Response } from "express";
import { calculateTxId } from "../utils";

const submissionEndpoint :string = config.get("server.txSubmissionEndpoint");

// THIS IS FOR CARDANO-WALLET, CBOR IS FOR CARDANO-SUBMIT-API (1.27.0).
const contentTypeHeaders = {
  "Content-Type": "application/json"
};
// const contentTypeHeaders = {"Content-Type": "application/cbor"};

export const handleSignedTx = async (req: Request, res: Response): Promise<void> => {
  if (!req.body.signedTx)
    throw new Error("No signedTx in body");

  try {
    const buffer = Buffer.from(req.body.signedTx, "base64");
    const txId = await calculateTxId(buffer.toString("base64"));

    await axios({
      method: "post"
      , url: submissionEndpoint
      , data: {
        txId: txId,
        signedTx: buffer.toString("base64")
      }
      , headers: contentTypeHeaders
    });
    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error submitting the TX");
  }
};
