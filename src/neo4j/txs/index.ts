import { Driver } from "neo4j-driver";
import { utxoForAddresses } from "./utxoForAddresses";
import { utxoSumForAddresses } from "./utxoSumForAddresses";
import { history } from "./history";
import { io } from "./io";
import { ioByIndex } from "./ioByIndex";
import { get } from "./get";
import { utxoDiffSincePoint } from "./utxoDiffSincePoint";
import { utxoAtPoint } from "./utxoAtPoint";
import { summaries } from "./summaries";

export const txs = (driver: Driver) => ({
  history: history(driver),
  utxoForAddresses: utxoForAddresses(driver),
  utxoSumForAddresses: utxoSumForAddresses(driver),
  io: io(driver),
  ioByIndex: ioByIndex(driver),
  get: get(driver),
  utxoDiffSincePoint: utxoDiffSincePoint(driver),
  utxoAtPoint: utxoAtPoint(driver),
  summaries: summaries(driver),
});