import config from "config";
import axios from "axios";
import { Request, Response } from "express";

const submissionEndpoint: string = config.get("server.txSubmissionEndpoint");
const blockfrostProjectKey: string = config.get("blockfrostProjectKey");

// const contentTypeHeaders = {"Content-Type": "application/octet-stream"}; // THIS IS FOR CARDANO-WALLET, CBOR IS FOR CARDANO-SUBMIT-API (1.27.0).
const contentTypeHeaders = {
  "Content-Type": "application/cbor",
  "User-Agent": "flint-wallet",
  "Cache-Control": "no-cache",
  project_id: blockfrostProjectKey,
};

export const handleSignedTx = async (
  req: Request,
  res: Response<any[]>
): Promise<void> => {
  console.log(req.body);
  if (!req.body.signedTx) throw new Error("No signedTx in body");

  const buffer = Buffer.from(req.body.signedTx, "base64");
  const LOGGING_MSG_HOLDER: [null | string, null | string] = [null, null];
  try {
    const endpointResponse: any = await axios({
      method: "post",
      url: submissionEndpoint,
      data: buffer,
      headers: contentTypeHeaders,
    }).then(
      (r) => {
        try {
          const { status, statusText, data } = r || {};
          LOGGING_MSG_HOLDER[0] = `FULL: ${JSON.stringify({
            status,
            statusText,
            data,
          })}`;
        } catch (e) {
          try {
            LOGGING_MSG_HOLDER[0] = `FULL_ERR: ${r} | ${e}`;
          } catch (ee) {
            LOGGING_MSG_HOLDER[0] = `FULL_ERR_ERR: ${ee}`;
          }
        }
        return r;
      },
      (err) => {
        try {
          LOGGING_MSG_HOLDER[1] = `ERR: ${JSON.stringify(err.response.data)}`;
        } catch (e) {
          LOGGING_MSG_HOLDER[1] = `ERR_ERR: ${err}`;
        }
      }
    );
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
