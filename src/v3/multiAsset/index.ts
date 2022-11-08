import { Driver } from "neo4j-driver";
import { metadata } from "./metadata";
import { policyIdExists } from "./policyIdExists";

export const multiAsset = (driver: Driver) => ({
  metadata: metadata(driver),
  policyIdExists: policyIdExists(driver)
});