import { Pool } from "pg";
import { Request, Response } from "express";

import {
  formatTokenMetadata,
  getMultiAssetTxMintMetadata,
  PolicyIdAssetMapType,
  PolicyIdAssetInfoMap,
} from "./../utils/tokenMetadata";

export const handleGetMultiAssetTxMintMetadata =
  (pool: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.body || !req.body.policyIdAssetMap) {
      throw new Error("Missing policyIdAssetMap on request body.");
    }
    if (
      Array.isArray(req.body.policyIdAssetMap) ||
      Object.keys(req.body.policyIdAssetMap).length === 0
    ) {
      throw new Error("policyIdAssetMap is not valid.");
    }

    const policyIdAssetMap: PolicyIdAssetMapType = req.body.policyIdAssetMap;

    const metadata = await getMultiAssetTxMintMetadata(pool, policyIdAssetMap);

    const mintTxResults: PolicyIdAssetInfoMap = formatTokenMetadata(
      metadata,
      policyIdAssetMap
    );

    res.send({ success: true, data: mintTxResults });
  };
