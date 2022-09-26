import neo4j from "neo4j-driver";
import { history } from "./history";

const driver = neo4j.driver(
  "neo4j://dus-01.emurgo-rnd.com:7687",
  neo4j.auth.basic("neo4j", "neo4j")
);

export const txs = {
  history: history(driver)
};