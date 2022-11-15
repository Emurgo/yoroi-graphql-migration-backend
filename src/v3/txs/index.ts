import { Driver } from "neo4j-driver";
import { utxoForAddresses } from "./utxoForAddresses";
import { history } from "./history";
import { io } from "./io";
import { ioByIndex } from "./ioByIndex";
import { get } from "./get";
import { utxoDiffSincePoint } from "./utxoDiffSincePoint";

export const txs = (driver: Driver) => ({
  history: history(driver),
  utxoForAddresses: utxoForAddresses(driver),
  io: io(driver),
  ioByIndex: ioByIndex(driver),
  get: get(driver),
  utxoDiffSincePoint: utxoDiffSincePoint(driver),
});