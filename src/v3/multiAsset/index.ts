import { Driver } from "neo4j-driver";
import { metadata } from "./metadata";
import { policyIdExists } from "./policyIdExists";
import { validateNFT } from "./validateNFT";

export const multiAsset = (driver: Driver) => ({
  metadata: metadata(driver),
  policyIdExists: policyIdExists(driver),
  validateNFT: validateNFT(driver)
});