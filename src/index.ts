import config from "config";
import http from "http";
import express from "express";
import * as websockets from "ws";
import { Request, Response } from "express";

import { Pool } from "pg";

// eslint-disable-next-line
const semverCompare = require("semver-compare");

import { connectionHandler} from "./ws-server"; 
import { applyMiddleware, applyRoutes, Route, UtilEither, errMsgs } from "./utils";
import * as utils from "./utils";
import * as middleware from "./middleware";

import { askBestBlock } from "./services/bestblock";
import { utxoForAddresses } from "./services/utxoForAddress";
import { askBlockNumByHash, askBlockNumByTxHash, askTransactionHistory } from "./services/transactionHistory";
import type { BlockNumByTxHashFrag } from "./services/transactionHistory";
import { filterUsedAddresses } from "./services/filterUsedAddress";
import { askUtxoSumForAddresses } from "./services/utxoSumForAddress";
import { handleSignedTx } from "./services/signedTransaction";
import { handlePoolInfo } from "./services/poolInfo";
import { handleGetAccountState } from "./services/accountState";
import { handleGetRegHistory } from "./services/regHistory";
import { handleGetRewardHistory } from "./services/rewardHistory";

import { HealthChecker } from "./HealthChecker";

import { createCertificatesView } from "./Transactions/certificates";
import { createTransactionOutputView } from "./Transactions/output";


const pool = new Pool({ user: config.get("db.user")
  , host: config.get("db.host")
  , database: config.get("db.database")
  , password: config.get("db.password")});
createCertificatesView(pool);
createTransactionOutputView(pool);


const healthChecker = new HealthChecker(() => askBestBlock(pool));

const router = express();

const middlewares = [ middleware.handleCors
  , middleware.handleBodyRequestParsing 
  , middleware.handleCompression 
];

applyMiddleware(middlewares, router);



const port:number= config.get("server.port");
const addressesRequestLimit:number = config.get("server.addressRequestLimit");
const apiResponseLimit:number = config.get("server.apiResponseLimit"); 

const bestBlock = (pool: Pool) => async (_req: Request, res: Response) => {
  const result = await askBestBlock(pool);
  switch(result.kind) {
  case "ok": {
    const cardano = result.value;
    res.send(cardano);
    return;
  }
  case "error":
    throw new Error(result.errMsg);

    return;
  default: return utils.assertNever(result);
  }
};

const utxoSumForAddresses = async (req: Request, res:Response) => {
  if(!req.body || !req.body.addresses) {
    throw new Error("error, no addresses.");
    return;
  }
  const verifiedAddresses = utils.validateAddressesReq(addressesRequestLimit
    , req.body.addresses);
  switch(verifiedAddresses.kind){
  case "ok":  {
    const result = await askUtxoSumForAddresses(pool, verifiedAddresses.value);
    switch(result.kind) {
    case "ok":
      res.send({ sum: result.value });
      return;
    case "error":
      throw new Error(result.errMsg);
      return;
    default: return utils.assertNever(result);  
    }
    return;
  }
  case "error":
    throw new Error(verifiedAddresses.errMsg);
    return;
  default: return utils.assertNever(verifiedAddresses);
  }
};

const getOrDefaultAfterParam = (
  result: UtilEither<BlockNumByTxHashFrag>
): {
  blockNumber: number,
  txIndex: number,
} => {
  if (result.kind !== "ok") {
    if (result.errMsg === errMsgs.noValue) {
      // default value since this is an optional field
      return {
        blockNumber: -1,
        txIndex: -1,
      };
    }
    throw new Error(result.errMsg);
  }
  return {
    blockNumber: result.value.block.number,
    txIndex: result.value.blockIndex,
  };
};

const txHistory = async (req: Request, res: Response) => {
  if(!req.body){
    throw new Error("error, no body");
    return;
  }
  const verifiedBody = utils.validateHistoryReq(addressesRequestLimit, apiResponseLimit, req.body);
  switch(verifiedBody.kind){
  case "ok": {
    const body = verifiedBody.value;
    const limit = body.limit || apiResponseLimit;
    const [referenceTx, referenceBlock] = (body.after && [body.after.tx, body.after.block]) || [];
    const referenceBestBlock = body.untilBlock;
    const untilBlockNum = await askBlockNumByHash(pool, referenceBestBlock);
    const afterBlockInfo = await askBlockNumByTxHash(pool, referenceTx);

    if(untilBlockNum.kind === "error" && untilBlockNum.errMsg === utils.errMsgs.noValue){
      throw new Error("REFERENCE_BEST_BLOCK_MISMATCH");
    }
    if(afterBlockInfo.kind === "error" && typeof referenceTx !== "undefined") {
      throw new Error("REFERENCE_TX_NOT_FOUND");
    }

    if(afterBlockInfo.kind === "ok" && afterBlockInfo.value.block.hash !== referenceBlock) {
      throw new Error("REFERENCE_BLOCK_MISMATCH");
    }

    // when things are running smoothly, we would never hit this case case
    if (untilBlockNum.kind !== "ok") {
      throw new Error(untilBlockNum.errMsg);
    }
    const afterInfo = getOrDefaultAfterParam(afterBlockInfo);

    const maybeTxs = await askTransactionHistory(pool, limit, body.addresses, afterInfo, untilBlockNum.value);
    switch(maybeTxs.kind) {
    case "ok":{
      const txs = maybeTxs.value.map( tx => ({
        hash: tx.hash,
        fee: tx.fee,
        metadata: tx.metadata,
        //ttl: tx.ttl,
        type: tx.blockEra,
        withdrawals: tx.withdrawals,
        certificates: tx.certificates,
        tx_ordinal: tx.txIndex,
        tx_state: "Successful", // graphql doesn't handle pending/failed txs
        last_update: tx.includedAt,
        block_num: tx.block.number,
        block_hash: tx.block.hash,
        time: tx.includedAt,
        epoch: tx.block.epochNo,
        slot: tx.block.slotNo,
        inputs: tx.inputs,
        outputs: tx.outputs
      }));

      res.send(txs);
      return;
    }
    case "error":
      throw new Error(maybeTxs.errMsg);
      return;
    default: return utils.assertNever(maybeTxs);
    }
    return;
  }
  case "error":
    throw new Error(verifiedBody.errMsg);
    return;
  default: return utils.assertNever(verifiedBody);
  }
};

const getStatus = async (req: Request, res:  Response) => {
  const mobilePlatformVersionPrefixes = ["android / ", "ios / ", "- /"];
  const desktopPlatformVersionPrefixes = ["firefox / ", "chrome / "];
  const clientVersionHeader = "yoroi-version";
  const minMobileVersion = "2.2.4";
  const minDesktopVersion = "1.10.4";
  if(clientVersionHeader in req.headers){
    const rawVerString : string | string[] | undefined = req.headers[clientVersionHeader];
    let verString = "none / 0.0.0";
    if (typeof rawVerString === "string") 
      verString = rawVerString;
    if(Array.isArray(rawVerString))
      verString = rawVerString[0];

    for(const prefix of mobilePlatformVersionPrefixes){
      if (verString.includes(prefix)){
        const simVer = verString.split(" / ")[1];
        if (semverCompare(simVer, minMobileVersion) < 0){
          res.send({ isServerOk: true
            , isMaintenance: true });
          return;
        }
      }
    }
    for(const prefix of desktopPlatformVersionPrefixes){
      if (verString.includes(prefix)){
        const simVer = verString.split(" / ")[1];
        if (semverCompare(simVer, minDesktopVersion) < 0){
          res.send({ isServerOk: true
            , isMaintenance: true });
          return;
        }
      }
    }
  }
  res.send({ isServerOk: true, isMaintenance: false, serverTime: Date.now() });
};

const routes : Route[] = [
  // deprecated endpoints
{   path: "/getAccountState"
  , method: "post"
  , handler: handleGetAccountState(pool)
}
, { path: "/getRegistrationHistory"
  , method: "post"
  , handler: handleGetRegHistory(pool)
}
, { path: "/getRewardHistory"
  , method: "post"
  , handler: handleGetRewardHistory(pool)
}
, { path: "/getPoolInfo"
  , method: "post"
  , handler: handlePoolInfo(pool)
}
// replacement endpoints
, { path: "/account/state"
  , method: "post"
  , handler: handleGetAccountState(pool)
}
, { path: "/account/registrationHistory"
  , method: "post"
  , handler: handleGetRegHistory(pool)
}
, { path: "/account/rewardHistory"
  , method: "post"
  , handler: handleGetRewardHistory(pool)
}
, { path: "/pool/info"
  , method: "post"
  , handler: handlePoolInfo(pool)
}
// regular endpoints
, {   path: "/v2/bestblock"
  , method: "get"
  , handler: bestBlock(pool)
}
, { path: "/v2/addresses/filterUsed"
  , method: "post"
  , handler: filterUsedAddresses(pool)
}
, { path: "/txs/utxoForAddresses"
  , method: "post"
  , handler: utxoForAddresses(pool)
}
, { path: "/txs/utxoSumForAddresses"
  , method: "post"
  , handler: utxoSumForAddresses
}
, { path: "/v2/txs/history"
  , method: "post"
  , handler: txHistory 
}
, { path: "/txs/signed"
  , method: "post"
  , handler: handleSignedTx
}
, { path: "/v2/importerhealthcheck"
  , method: "get"
  , handler: async (_req: Request, res: Response) => {
    const status = healthChecker.getStatus();
    if (status === "OK")
      res.send({ code: 200, message: "Importer is OK" });
    else if (status === "BLOCK_IS_STALE")
      res.send({ code: 200, message: "Importer seems OK. Not enough time has passed since last valid request." });
    else 
      throw new Error(status);
  }
}
, { path: "/status"
  , method: "get"
  , handler: getStatus
}
];

applyRoutes(routes, router);
router.use(middleware.logErrors);
router.use(middleware.errorHandler);

const server = http.createServer(router);

const wss = new websockets.Server({ server } );
wss.on("connection", connectionHandler(pool));

server.listen(port, () =>
  console.log(`listening on ${port}...`)
);

