import { Driver } from "neo4j-driver";
import { metadata } from "./metadata";

export const multiAsset = (driver: Driver) => ({
  metadata: metadata(driver)
});