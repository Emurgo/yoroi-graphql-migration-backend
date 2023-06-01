import { Driver } from "neo4j-driver";
import { filterUsed } from "./filterUsed";

export const addresses = (driver: Driver) => ({
  filterUsed: filterUsed(driver)
});