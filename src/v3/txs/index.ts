import { history } from "./history";
import config from "config";
import { Pool } from "pg";

const pool = new Pool({
  user: config.get("carp.user"),
  host: config.get("carp.host"),
  database: config.get("carp.database"),
  password: config.get("carp.password"),
  port: config.get("carp.port"),
});

export const txs = {
  history: history(pool)
};