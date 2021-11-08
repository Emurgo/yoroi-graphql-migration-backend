import {
  formatTokenMetadata,
  getMultiAssetTxMintMetadata,
  PolicyIdAssetMapType,
  PolicyIdAssetInfoMap,
} from "./../utils/tokenMetadata";
import axios from "axios";
import config from "config";
import { Pool } from "pg";
import { Request, Response } from "express";
import { isObject } from "lodash";

export const handleGetMultiAssetTxMintMetadata =
  (pool: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.body || !req.body.policyIdAssetMap) {
      throw new Error("Missing policyIdAssetMap on request body.");
    }
    if (!isObject(req.body.policyIdAssetMap)) {
      throw new Error("policyIdAssetMap should not be empty.");
    }

    const policyIdAssetMap: PolicyIdAssetMapType = req.body.policyIdAssetMap;

    const metadata = await getMultiAssetTxMintMetadata(pool, policyIdAssetMap);

    const mintTxResults: PolicyIdAssetInfoMap = formatTokenMetadata(
      metadata,
      policyIdAssetMap
    );

    const apiURL: string = config.get("server.tokenInfoFeed");
    try {
      const tokenRegistryResponse = await axios.post(apiURL, req.body);
      switch (tokenRegistryResponse.status) {
        case 500:
          res
            .status(500)
            .send("Problem with the token registry API server. Server error.");
          break;
        case 400:
          res.status(400).send(" Bad request token registry API server.");
          break;
        default:
          if (tokenRegistryResponse.data?.success) {
            const tokenRegistryData = tokenRegistryResponse.data?.data;

            Object.keys(policyIdAssetMap).forEach((policyIdHex: string) => {
              const assetIds = policyIdAssetMap[policyIdHex];

              assetIds.forEach((assetIdHex: string) => {
                if (mintTxResults[policyIdHex] == null) {
                  mintTxResults[policyIdHex] = {};
                }
                mintTxResults[policyIdHex][assetIdHex] = {
                  ...mintTxResults[policyIdHex][assetIdHex],
                  ...tokenRegistryData[policyIdHex]?.[assetIdHex],
                };
              });
            });
          }
      }
    } catch (e) {
      console.log(`Error getting details from Token Registry ${e}`);
      throw new Error("Error getting details from Token Registry");
    }

    res.send(mintTxResults);
  };
