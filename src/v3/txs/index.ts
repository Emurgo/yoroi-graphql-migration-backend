import { Driver } from "neo4j-driver";
import { utxoForAddresses } from "./utxoForAddresses";
import { history } from "./history";
import { io } from "./io";

export const txs = (driver: Driver) => ({
  history: history(driver),
  utxoForAddresses: utxoForAddresses(driver),
  io: io(driver)
});