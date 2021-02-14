import { UtilEither } from "./utils";
import * as BestBlock from "./services/bestblock";

const REQUEST_RATE_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;
const REQUEST_STALE_BLOCK = 50000;

export type HealthCheckerStatus = "OK" | "DOWN" | "SLOW" | "BLOCK_IS_STALE";

export class HealthChecker {
  // given a function that returns a /bestBlock, this class
  // will spawn a thread that checks to see that /bestBlock
  // is changing over time.  
  // If it is not, then we have an error!

  healthCheckerFunc : () => Promise<UtilEither<BestBlock.CardanoFrag>>;

  lastBlock : UtilEither<BestBlock.CardanoFrag>;
  lastTime : number;
  lastGoodBlockChange : number;
  timeAndBlock : [number, UtilEither<BestBlock.CardanoFrag>];

  constructor(bestBlockFunc: () => Promise<UtilEither<BestBlock.CardanoFrag>>) {
    this.healthCheckerFunc = bestBlockFunc;
    const currentTime = Date.now();

    this.lastBlock = { kind: "error", errMsg: "init" };
    this.lastTime = currentTime;
    this.lastGoodBlockChange = currentTime;
    this.timeAndBlock = [currentTime, { kind: "error", errMsg: "init" }];

    setInterval(this.checkHealth, REQUEST_RATE_MS);
    
  }

  checkHealth = async(): Promise<void> =>  {
    let block: UtilEither<BestBlock.CardanoFrag> = { kind: "error", errMsg: "function failed" };
    try {
      block = await this.healthCheckerFunc();
    } catch {
      // leave `block` alone, it already denotes that the function failed.
    }
    const currentTime = Date.now();

    const [currentSavedTime, currentBlock] = this.timeAndBlock;

    if (currentBlock.kind !== this.lastBlock.kind) {
      this.lastBlock = currentBlock;
    }

    if (currentBlock.kind === "ok" && this.lastBlock.kind === "ok") {
      if (currentBlock.value != null && currentBlock.value.height !== this.lastBlock.value.height) {
        this.lastBlock = currentBlock;
        this.lastGoodBlockChange = currentTime;
      }
    }

    this.lastTime = currentSavedTime;
    this.timeAndBlock = [currentTime, block];
  }

  getStatus = (): HealthCheckerStatus => {
    const [currentSavedTime, currentBlock] = this.timeAndBlock;
    if (currentBlock.kind !== "ok" || currentBlock.value == null)
      return "DOWN";
    if (currentSavedTime - this.lastTime > REQUEST_TIMEOUT_MS)
      return "SLOW";
    if (currentSavedTime - this.lastGoodBlockChange > REQUEST_STALE_BLOCK)
      if(this.lastBlock.kind === "ok")
        if(this.lastBlock.value.height === currentBlock.value.height)
          return "BLOCK_IS_STALE";
    return "OK";
  }

}


