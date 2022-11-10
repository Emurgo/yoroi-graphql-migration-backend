import { Driver } from "neo4j-driver";
import { info } from "./info";

export const pool = (driver: Driver) => ({
  info: info(driver)
});