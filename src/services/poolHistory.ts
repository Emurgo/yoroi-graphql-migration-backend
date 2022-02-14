import config from "config";
import axios from "axios";
import { Pool } from "pg";
import { Request, Response } from "express";

import { rowToCertificate, Certificate } from "../Transactions/types";
import { UtilEither } from "../utils";
import { latestMetadataQuery, poolHistoryQuery } from "./poolInfo";
const smashEndpoint: string = config.get("server.smashEndpoint");

const addressesRequestLimit: number = config.get("server.addressRequestLimit");

interface PoolDelegationRange {
  fromEpoch: number;
  toEpoch?: number;
}

interface DelegationRangeResponse {
  hash: string;
  epoch: number;
  slot: number;
  tx_ordinal: number;
  cert_ordinal: number;
  payload: Certificate | null;
  info: {
    name: string;
    description: string;
    ticket: string;
    homepage: string;
  };
}

export const metadataDataFromSmash = async (
  p: Pool,
  hash: string
): Promise<UtilEither<Record<string, unknown>>> => {
  if (hash.length !== 56) {
    throw new Error(`Received invalid pool id: ${hash}`);
  }

  const metadataHashResp = await p.query(latestMetadataQuery, [hash]);
  if (metadataHashResp.rows.length === 0) {
    return {
      kind: "error",
      errMsg: "metadataDataFromSmash: metadataHashResp empty",
    };
  }

  const metadataHash = metadataHashResp.rows[0].metadata_hash;

  try {
    const endpointResponse = await axios.get(
      `${smashEndpoint}${hash}/${metadataHash}`
    );
    if (endpointResponse.status === 200) {
      return endpointResponse.data;
    } else {
      console.log(`SMASH did not respond to user submitted hash: ${hash}`);
    }
  } catch (e) {
    console.log(`SMASH did not respond with hash ${hash}, giving error ${e}`);
  }

  return {
    kind: "error",
    errMsg: `metadataDataFromSmash: smash server error for ${hash}`,
  };
};

// Note: the results are NOT sorted on purpose
export const poolDelegationHistory =
  (p: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.body.poolRanges)
      throw new Error("No poolRanges dictionary in body");

    const hashes = Object.keys(req.body.poolRanges);

    if (hashes && hashes.length > addressesRequestLimit)
      throw new Error(
        `poolRanges must have between 0 and ${addressesRequestLimit} items`
      );

    const delegationRanges: PoolDelegationRange[] = Object.values(
      req.body.poolRanges
    );

    for (const delegationRange of delegationRanges)
      if (!delegationRange.fromEpoch)
        throw new Error("Missing fromEpoch in one of the requested objects");

    const ret: Array<DelegationRangeResponse> = [];
    for (const hash of hashes) {
      if (hash.length !== 56) {
        throw new Error(`Received invalid pool id: ${hash}`);
      }

      const info = await metadataDataFromSmash(p, hash);
      if (info.kind === "error") continue;

      const dbHistory = await p.query(poolHistoryQuery, [hash]);
      const delegationRange: PoolDelegationRange = req.body.poolRanges[hash];

      const lowerBoundary = delegationRange.fromEpoch;
      const upperBoundary = delegationRange.toEpoch;

      const history: DelegationRangeResponse[] = dbHistory.rows.reduce(
        (result: any[], row: any) => {
          if (row.epoch_no < lowerBoundary) return result;
          if (upperBoundary && row.epoch_no > upperBoundary) return result;

          result.push({
            epoch: row.epoch_no,
            slot: row.epoch_slot_no,
            tx_ordinal: row.tx_index,
            cert_ordinal: row.certIndex,
            payload: rowToCertificate(row.jsonCert),
            info: info,
            poolHash: hash,
          });

          return result;
        },
        []
      );

      ret.push(...history.reverse());
    }
    res.send(ret);
    return;
  };
