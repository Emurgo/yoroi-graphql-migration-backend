import config from "config";
import axios from "axios";
import { Request, Response } from "express";
import { calculateTxId } from "../utils";

const submissionEndpoint: string = config.get("server.txSubmissionEndpoint");

// THIS IS FOR CARDANO-WALLET, CBOR IS FOR CARDANO-SUBMIT-API (1.27.0).
const contentType =
  config.get("usingQueueEndpoint") === "true"
    ? "application/json"
    : `application/${process.env.TX_SUBMIT_CONTENT_TYPE || "octet-stream"}`;
const contentTypeHeaders = {
  "Content-Type": contentType,
};
// const contentTypeHeaders = {"Content-Type": "application/cbor"};

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
  try {
    const endpointResponse: any = await axios({
      method: "post",
      url: submissionEndpoint,
      data: buffer,
      headers: contentTypeHeaders,
    });
    if (endpointResponse?.status === 202) {
      if (endpointResponse.data.Left) {
        const msg = `Transaction was rejected: ${endpointResponse.data.Left}`;
        console.log("signedTransaction request body: " + req.body.signedTx);
        throw Error(msg);
      }
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
          }
        )}`
      );
    }
  } catch (error: any) {
    if (error.response != null) {
      const { status, data } = error.response;
      res.status(status).send(data);
      return;
    }
    throw Error(`Error trying to send transaction: ${String(error)}`);
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
