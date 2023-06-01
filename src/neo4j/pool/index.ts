import { Driver } from "neo4j-driver";
import { info } from "./info";
import { delegationHistory } from "./delegationHistory";

export const pool = (driver: Driver) => ({
  info: info(driver),
  delegationHistory: delegationHistory(driver)
});