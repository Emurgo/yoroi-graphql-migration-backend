import neo4j from "neo4j-driver";
import config from "config";

import { addresses } from "./addresses";
import { txs } from "./txs";
import { bestblock } from "./bestblock";
import { multiAsset } from "./multiAsset";
import { account } from "./account";
import { pool } from "./pool";
import { asset } from "./asset";

const driver = neo4j.driver(
  config.get("neo4j.url"),
  neo4j.auth.basic(config.get("neo4j.username"), config.get("neo4j.password")),
);

export const v3 = {
  txs: txs(driver),
  bestblock: bestblock(driver),
  addresses: addresses(driver),
  multiAsset: multiAsset(driver),
  account: account(driver),
  pool: pool(driver),
  asset: asset(driver)
};