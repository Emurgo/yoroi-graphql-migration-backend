import config from "config";
import axios from "axios";
import { Request, Response } from "express";
import { calculateTxId } from "../utils";

const submissionEndpoint: string = config.get("server.txSubmissionEndpoint");
const blockfrostProjectKey: string = config.get("blockfrostProjectKey");

// const contentTypeHeaders = {"Content-Type": "application/octet-stream"}; // THIS IS FOR CARDANO-WALLET, CBOR IS FOR CARDANO-SUBMIT-API (1.27.0).
const contentTypeHeaders = {
  "Content-Type": "application/cbor",
  "User-Agent": "flint-wallet",
  "Cache-Control": "no-cache",
  project_id: blockfrostProjectKey,
};

const submitToQueue = async (req: Request, res: Response) => {
  try {
    const buffer = Buffer.from(req.body.signedTx, "base64");
    const txId = await calculateTxId(buffer.toString("base64"));

    const signedTxQueueEndpoint = config.get("server.signedTxQueueEndpoint");

    await axios({
      method: "post",
      url: `${signedTxQueueEndpoint}api/submit/tx`,
      data: {
        txId: txId,
        signedTx: buffer.toString("base64"),
      },
      headers: contentTypeHeaders,
    });
    res.status(200).send({ txId });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error submitting the TX");
  }
};

const submit = async (req: Request, res: Response) => {
  const buffer = Buffer.from(req.body.signedTx, "base64");
  const LOGGING_MSG_HOLDER: [null | string, null | string] = [null, null];
  try {
    const endpointResponse: any = await axios({
      method: "post"
      , url: submissionEndpoint
      , data: buffer
      , headers: contentTypeHeaders
    });

    if (endpointResponse.status === 200) {
      res.send([]);
      return;
    } else {
      const { status, statusText, data } = endpointResponse || {};
      throw Error(
        `I did not understand the response from the submission endpoint: ${JSON.stringify(
          {
            status,
            statusText,
            data,
            err: LOGGING_MSG_HOLDER[1],
          }
        )}`
      );
    }
  } catch (error: any) {
    const msg = `Error trying to send transaction: ${error} - ${JSON.stringify(
      LOGGING_MSG_HOLDER
    )}`;
    throw Error(msg);
  }
};

export const handleSignedTx = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.body.signedTx) throw new Error("No signedTx in body");

  if (config.get("usingQueueEndpoint") === "true") {
    await submitToQueue(req, res);
  } else {
    await submit(req, res);
  }
};
