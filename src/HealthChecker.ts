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
  currentBlock : [number, UtilEither<BestBlock.CardanoFrag>];

  constructor( bestBlockFunc : () => Promise<UtilEither<BestBlock.CardanoFrag>> ) {
    this.healthCheckerFunc = bestBlockFunc;
    const currentTime = Date.now();

    this.lastBlock = { kind: 'error', errMsg: 'init' };
    this.lastTime = currentTime;
    this.lastGoodBlockChange = currentTime;
    this.currentBlock = [currentTime, { kind: 'error', errMsg: 'init' }];

    setInterval( this.checkHealth, REQUEST_RATE_MS);
    
  }

  checkHealth = async () =>  {
    let mBlock : UtilEither<BestBlock.CardanoFrag> = { kind: 'error', errMsg: 'function failed' };
    try {
      mBlock = await this.healthCheckerFunc();
    } catch {
    }
    const currentTime = Date.now();

    const [currentSavedTime, currentMBlock] = this.currentBlock;

    if(currentMBlock.kind !== this.lastBlock.kind)
      this.lastBlock = currentMBlock;
    if(currentMBlock.kind === 'ok' && this.lastBlock.kind === 'ok')
      if(currentMBlock.value.blockHeight !== this.lastBlock.value.blockHeight){
        this.lastBlock = currentMBlock;
        this.lastGoodBlockChange = currentTime;
      }
       

    this.lastTime = currentSavedTime;
    this.currentBlock = [currentTime, mBlock];
  }

  getStatus = ():HealthCheckerStatus => {
    const [currentSavedTime, currentMBlock] = this.currentBlock;
    if (currentMBlock.kind !== 'ok')
      return "DOWN";
    if (currentSavedTime - this.lastTime > REQUEST_TIMEOUT_MS)
      return "SLOW";
    if (currentSavedTime - this.lastGoodBlockChange > REQUEST_STALE_BLOCK)
        if(this.lastBlock.kind === 'ok')
            if(this.lastBlock.value.blockHeight === currentMBlock.value.blockHeight)
                return "BLOCK_IS_STALE";
    return "OK";

  }

}


