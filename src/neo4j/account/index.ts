import { Driver } from "neo4j-driver";
import { registrationHistory } from "./registrationHistory";

export const account = (driver: Driver) => ({
  registrationHistory: registrationHistory(driver)
});