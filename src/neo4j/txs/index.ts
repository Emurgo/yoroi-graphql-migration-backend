import { Driver } from "neo4j-driver";
import { utxoForAddresses } from "./utxoForAddresses";
import { utxoSumForAddresses } from "./utxoSumForAddresses";
import { history } from "./history";
import { io } from "./io";
import { ioByIndex } from "./ioByIndex";
import { utxoAtPoint } from "./utxoAtPoint";
import { utxoDiffSincePoint } from "./utxoDiffSincePoint";
import { get } from "./get";

export const txs = (driver: Driver) => ({
  history: history(driver),
  utxoForAddresses: utxoForAddresses(driver),
  utxoSumForAddresses: utxoSumForAddresses(driver),
  io: io(driver),
  ioByIndex: ioByIndex(driver),
  get: get(driver),
  utxoAtPoint: utxoAtPoint(driver),
  utxoDiffSincePoint: utxoDiffSincePoint(driver),
});