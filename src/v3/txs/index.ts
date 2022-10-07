import neo4j from "neo4j-driver";
import { history } from "./history";
import config from "config";

const driver = neo4j.driver(
  config.get("neo4j.url"),
  neo4j.auth.basic(config.get("neo4j.username"), config.get("neo4j.password"))
);

export const txs = {
  history: history(driver)
};