import { Driver } from "neo4j-driver";
import { mintTxs } from "./mintTxs";

export const asset = (driver: Driver) => ({
  mintTxs: mintTxs(driver)
});