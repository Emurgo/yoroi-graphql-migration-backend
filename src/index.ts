import axios from "axios";
import config from "config";
import http from "http";
import express from "express";
import * as websockets from "ws";
import { Request, Response } from "express";

import { Pool } from "pg";

// eslint-disable-next-line
const semverCompare = require("semver-compare");

import { connectionHandler } from "./ws-server";
import {
  applyMiddleware,
  applyRoutes,
  Route,
  UtilEither,
  errMsgs,
} from "./utils";
import * as utils from "./utils";
import * as middleware from "./middleware";

import { askBestBlock } from "./services/bestblock";
import { utxoForAddresses } from "./services/utxoForAddress";
import { utxoAtPoint } from "./services/utxoAtPoint";
import {
  askBlockNumByHash,
  askBlockNumByTxHash,
  askTransactionHistory,
} from "./services/transactionHistory";
import type { BlockNumByTxHashFrag } from "./services/transactionHistory";
import { filterUsedAddresses } from "./services/filterUsedAddress";
import { askUtxoSumForAddresses } from "./services/utxoSumForAddress";
import { handleSignedTx } from "./services/signedTransaction";
import { handlePoolInfo } from "./services/poolInfo";
import { handleGetAccountState } from "./services/accountState";
import { handleGetRegHistory } from "./services/regHistory";
import { handleGetRewardHistory } from "./services/rewardHistory";
import { handleGetMultiAssetSupply } from "./services/multiAssetSupply";
import { handleGetMultiAssetTxMintMetadata } from "./services/multiAssetTxMint";
import { handleGetAssetMintTxs } from "./services/assetMintTxs";
import { handleTxStatus } from "./services/txStatus";
import { handleUtxoDiffSincePoint } from "./services/utxoDiffSincePoint";
import { handleGetTxIO, handleGetTxOutput } from "./services/txIO";
import { handleTipStatusGet, handleTipStatusPost } from "./services/tipStatus";
import { handleGetTransactions } from "./services/transactions";
import { handleValidateNft } from "./services/validateNft";

import { handlePolicyIdExists } from "./services/policyIdExists";

import { HealthChecker } from "./HealthChecker";

import { createCertificatesView } from "./Transactions/certificates";
import { createTransactionOutputView } from "./Transactions/output";
import { createValidUtxosView } from "./Transactions/valid_utxos_view";
import { createUtxoFunctions } from "./Transactions/utxoFunctions";
import { createTransactionUtilityFunctions } from "./Transactions/userDefinedFunctions";
import { poolDelegationHistory } from "./services/poolHistory";
import { handleGetCardanoWalletPools } from "./services/cardanoWallet";

import { handleMessageBoard } from "./services/messageBoard";
import { handleMessageDirect } from "./services/messageDirect";

import { handleOracleDatapoint } from "./services/oracleDatapoint";
import { handleOracleTicker } from "./services/oracleTicker";

import { mapTransactionFragsToResponse } from "./utils/mappers";
import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";

import installCoinPriceHandlers from "./coin-price/handler";

const pool = new Pool({
  user: config.get("db.user"),
  host: config.get("db.host"),
  database: config.get("db.database"),
  password: config.get("db.password"),
  port: config.get("db.port"),
});
createCertificatesView(pool);
createValidUtxosView(pool);
createTransactionOutputView(pool);
createUtxoFunctions(pool);
createTransactionUtilityFunctions(pool);

const healthChecker = new HealthChecker(() => askBestBlock(pool));

const router = express();

Sentry.init({
  dsn: process.env.DSNExpress,
  integrations: [
    // enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // enable Express.js middleware tracing
    new Tracing.Integrations.Express({
      // to trace all requests to the default router
      router,
      // alternatively, you can specify the routes you want to trace:
      // router: someRouter,
    }),
    new Tracing.Integrations.Postgres(),
  ],

  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
});

router.use(Sentry.Handlers.requestHandler());
router.use(Sentry.Handlers.tracingHandler());

const middlewares = [
  middleware.handleCors,
  middleware.handleBodyRequestParsing,
  middleware.handleCompression,
];

applyMiddleware(middlewares, router);

const port: number = config.get("server.port");
const addressesRequestLimit: number = config.get("server.addressRequestLimit");
const apiResponseLimit: number = config.get("server.apiResponseLimit");

const bestBlock = (pool: Pool) => async (_req: Request, res: Response) => {
  const result = await askBestBlock(pool);
  switch (result.kind) {
    case "ok": {
      const cardano = result.value;
      res.send(cardano);
      return;
    }
    case "error":
      throw new Error(result.errMsg);
    default:
      return utils.assertNever(result);
  }
};

const utxoSumForAddresses = async (req: Request, res: Response) => {
  if (!req.body || !req.body.addresses) {
    throw new Error("error, no addresses.");
  }
  const verifiedAddresses = utils.validateAddressesReq(
    addressesRequestLimit,
    req.body.addresses
  );
  switch (verifiedAddresses.kind) {
    case "ok": {
      const result = await askUtxoSumForAddresses(
        pool,
        verifiedAddresses.value
      );
      switch (result.kind) {
        case "ok":
          res.send(result.value);
          return;
        case "error":
          throw new Error(result.errMsg);
        default:
          return utils.assertNever(result);
      }
    }
    case "error":
      throw new Error(verifiedAddresses.errMsg);
    default:
      return utils.assertNever(verifiedAddresses);
  }
};

const getOrDefaultAfterParam = (
  result: UtilEither<BlockNumByTxHashFrag>
): {
  blockNumber: number;
  txIndex: number;
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
  if (!req.body) {
    throw new Error("error, no body");
  }
  const verifiedBody = utils.validateHistoryReq(
    addressesRequestLimit,
    apiResponseLimit,
    req.body
  );
  switch (verifiedBody.kind) {
    case "ok": {
      const body = verifiedBody.value;
      const limit = body.limit || apiResponseLimit;
      const [referenceTx, referenceBlock] =
        (body.after && [body.after.tx, body.after.block]) || [];
      const referenceBestBlock = body.untilBlock;
      const untilBlockNum = await askBlockNumByHash(pool, referenceBestBlock);
      const afterBlockInfo = await askBlockNumByTxHash(pool, referenceTx);

      if (
        untilBlockNum.kind === "error" &&
        untilBlockNum.errMsg === utils.errMsgs.noValue
      ) {
        throw new Error("REFERENCE_BEST_BLOCK_MISMATCH");
      }
      if (
        afterBlockInfo.kind === "error" &&
        typeof referenceTx !== "undefined"
      ) {
        throw new Error("REFERENCE_TX_NOT_FOUND");
      }

      if (
        afterBlockInfo.kind === "ok" &&
        afterBlockInfo.value.block.hash !== referenceBlock
      ) {
        throw new Error("REFERENCE_BLOCK_MISMATCH");
      }

      // when things are running smoothly, we would never hit this case case
      if (untilBlockNum.kind !== "ok") {
        throw new Error(untilBlockNum.errMsg);
      }
      const afterInfo = getOrDefaultAfterParam(afterBlockInfo);

      const maybeTxs = await askTransactionHistory(
        pool,
        limit,
        body.addresses,
        afterInfo,
        untilBlockNum.value
      );
      switch (maybeTxs.kind) {
        case "ok": {
          const txs = mapTransactionFragsToResponse(maybeTxs.value);

          res.send(txs);
          return;
        }
        case "error":
          throw new Error(maybeTxs.errMsg);
        default:
          return utils.assertNever(maybeTxs);
      }
    }
    case "error":
      throw new Error(verifiedBody.errMsg);
    default:
      return utils.assertNever(verifiedBody);
  }
};

const getStatus = async (req: Request, res: Response) => {
  const isQueueOnline = config.get("usingQueueEndpoint") === "true";
  const mobilePlatformVersionPrefixes = ["android / ", "ios / ", "- /"];
  const desktopPlatformVersionPrefixes = ["firefox / ", "chrome / "];
  const clientVersionHeader = "yoroi-version";
  const minMobileVersion = "2.2.4";
  const minDesktopVersion = "1.10.4";
  if (clientVersionHeader in req.headers) {
    const rawVerString: string | string[] | undefined =
      req.headers[clientVersionHeader];
    let verString = "none / 0.0.0";
    if (typeof rawVerString === "string") verString = rawVerString;
    if (Array.isArray(rawVerString)) verString = rawVerString[0];

    for (const prefix of mobilePlatformVersionPrefixes) {
      if (verString.includes(prefix)) {
        const simVer = verString.split(" / ")[1];
        if (semverCompare(simVer, minMobileVersion) < 0) {
          res.send({ isServerOk: true, isMaintenance: true });
          return;
        }
      }
    }
    for (const prefix of desktopPlatformVersionPrefixes) {
      if (verString.includes(prefix)) {
        const simVer = verString.split(" / ")[1];
        if (semverCompare(simVer, minDesktopVersion) < 0) {
          res.send({ isServerOk: true, isMaintenance: true });
          return;
        }
      }
    }
  }
  res.send({
    parallelSync: Boolean(process.env.PARALLEL_SYNC),
    isServerOk: true,
    isMaintenance: false,
    serverTime: Date.now(),
    isQueueOnline,
  });
};

const getFundInfo = async (req: Request, res: Response) => {
  const response = await axios.get(
    "https://servicing-station.vit.iohk.io/api/v0/fund"
  );
  if (response.data) {
    const chainVotePlan = response.data.chain_vote_plans.reduce(
      (prev: any, curr: any) => {
        if (!prev.id) return curr;
        if (prev.id > curr.id) return prev;
        return curr;
      },
      {} as any
    );
    return res.send({
      currentFund: {
        id: 8,
        registrationStart: response.data.fund_start_time,
        registrationEnd: response.data.fund_end_time,
        votingStart: chainVotePlan.chain_vote_start_time,
        votingEnd: chainVotePlan.chain_vote_end_time,
        votingPowerThreshold: Math.floor(
          response.data.voting_power_threshold / 1_000_000
        ).toString(),
      },
    });
  }

  return res.status(500).send();
};

const routes: Route[] = [
  // deprecated endpoints
  {
    path: "/getAccountState",
    method: "post",
    handler: handleGetAccountState(pool),
  },
  {
    path: "/getRegistrationHistory",
    method: "post",
    handler: handleGetRegHistory(pool),
  },
  {
    path: "/getRewardHistory",
    method: "post",
    handler: handleGetRewardHistory(pool),
  },
  { path: "/getPoolInfo", method: "post", handler: handlePoolInfo(pool) },
  // replacement endpoints
  {
    path: "/account/state",
    method: "post",
    handler: handleGetAccountState(pool),
  },
  {
    path: "/v2.1/account/state",
    method: "post",
    handler: handleGetAccountState(pool),
  },
  {
    path: "/account/registrationHistory",
    method: "post",
    handler: handleGetRegHistory(pool),
  },
  {
    path: "/v2.1/account/registrationHistory",
    method: "post",
    handler: handleGetRegHistory(pool),
  },
  {
    path: "/account/rewardHistory",
    method: "post",
    handler: handleGetRewardHistory(pool),
  },
  {
    path: "/v2.1/account/rewardHistory",
    method: "post",
    handler: handleGetRewardHistory(pool),
  },
  { path: "/pool/info", method: "post", handler: handlePoolInfo(pool) },
  { path: "/v2.1/pool/info", method: "post", handler: handlePoolInfo(pool) },
  {
    path: "/pool/delegationHistory",
    method: "post",
    handler: poolDelegationHistory(pool),
  },
  {
    path: "/v2.1/pool/delegationHistory",
    method: "post",
    handler: poolDelegationHistory(pool),
  },
  // regular endpoints
  { path: "/v2/bestblock", method: "get", handler: bestBlock(pool) },
  { path: "/v2.1/bestblock", method: "get", handler: bestBlock(pool) },
  { path: "/v2/tipStatus", method: "get", handler: handleTipStatusGet(pool) },
  { path: "/v2.1/tipStatus", method: "get", handler: handleTipStatusGet(pool) },
  { path: "/v2/tipStatus", method: "post", handler: handleTipStatusPost(pool) },
  { path: "/v2.1/tipStatus", method: "post", handler: handleTipStatusPost(pool) },
  { path: "/v2/txs/utxoAtPoint", method: "post", handler: utxoAtPoint(pool) },
  { path: "/v2.1/txs/utxoAtPoint", method: "post", handler: utxoAtPoint(pool) },
  {
    path: "/v2/txs/utxoDiffSincePoint",
    method: "post",
    handler: handleUtxoDiffSincePoint(pool),
  },
  {
    path: "/v2.1/txs/utxoDiffSincePoint",
    method: "post",
    handler: handleUtxoDiffSincePoint(pool),
  },
  {
    path: "/v2/addresses/filterUsed",
    method: "post",
    handler: filterUsedAddresses(pool),
  },
  {
    path: "/v2.1/addresses/filterUsed",
    method: "post",
    handler: filterUsedAddresses(pool),
  },
  {
    path: "/v2/txs/utxoAtPoint",
    method: "post",
    handler: utxoAtPoint(pool),
  },
  {
    path: "/v2.1/txs/utxoAtPoint",
    method: "post",
    handler: utxoAtPoint(pool),
  },
  {
    path: "/txs/utxoForAddresses",
    method: "post",
    handler: utxoForAddresses(pool),
  },
  {
    path: "/v2.1/txs/utxoForAddresses",
    method: "post",
    handler: utxoForAddresses(pool),
  },
  {
    path: "/txs/utxoSumForAddresses",
    method: "post",
    handler: utxoSumForAddresses,
  },
  {
    path: "/v2.1/txs/utxoSumForAddresses",
    method: "post",
    handler: utxoSumForAddresses,
  },
  { path: "/v2/txs/history", method: "post", handler: txHistory },
  { path: "/v2.1/txs/history", method: "post", handler: txHistory },
  { path: "/txs/io/:tx_hash", method: "get", handler: handleGetTxIO(pool) },
  { path: "/v2.1/txs/io/:tx_hash", method: "get", handler: handleGetTxIO(pool) },
  {
    path: "/txs/io/:tx_hash/o/:index",
    method: "get",
    handler: handleGetTxOutput(pool),
  },
  {
    path: "/v2.1/txs/io/:tx_hash/o/:index",
    method: "get",
    handler: handleGetTxOutput(pool),
  },
  { path: "/v2/txs/get", method: "post", handler: handleGetTransactions(pool) },
  { path: "/v2.1/txs/get", method: "post", handler: handleGetTransactions(pool) },
  { path: "/txs/signed", method: "post", handler: handleSignedTx },
  { path: "/v2.1/txs/signed", method: "post", handler: handleSignedTx },
  {
    path: "/messages/getMessageBoard",
    method: "post",
    handler: handleMessageBoard(pool),
  },
  {
    path: "/v2.1/messages/getMessageBoard",
    method: "post",
    handler: handleMessageBoard(pool),
  },
  {
    path: "/messages/getMessageDirect",
    method: "post",
    handler: handleMessageDirect(pool),
  },
  {
    path: "/v2.1/messages/getMessageDirect",
    method: "post",
    handler: handleMessageDirect(pool),
  },
  {
    path: "/oracles/getDatapoints",
    method: "post",
    handler: handleOracleDatapoint(pool),
  },
  {
    path: "/v2.1/oracles/getDatapoints",
    method: "post",
    handler: handleOracleDatapoint(pool),
  },
  {
    path: "/oracles/getTickers",
    method: "post",
    handler: handleOracleTicker(pool),
  },
  {
    path: "/v2.1/oracles/getTickers",
    method: "post",
    handler: handleOracleTicker(pool),
  },
  {
    path: "/pool/cardanoWallet",
    method: "get",
    handler: handleGetCardanoWalletPools(pool),
  },
  {
    path: "/v2.1/pool/cardanoWallet",
    method: "get",
    handler: handleGetCardanoWalletPools(pool),
  },
  {
    path: "/multiAsset/supply",
    method: "post",
    handler: handleGetMultiAssetSupply(pool),
  },
  {
    path: "/v2.1/multiAsset/supply",
    method: "post",
    handler: handleGetMultiAssetSupply(pool),
  },
  {
    path: "/multiAsset/metadata",
    method: "post",
    handler: handleGetMultiAssetTxMintMetadata(pool),
  },
  {
    path: "/v2.1/multiAsset/metadata",
    method: "post",
    handler: handleGetMultiAssetTxMintMetadata(pool),
  },
  {
    path: "/asset/:fingerprint/mintTxs",
    method: "get",
    handler: handleGetAssetMintTxs(pool),
  },
  {
    path: "/v2.1/asset/:fingerprint/mintTxs",
    method: "get",
    handler: handleGetAssetMintTxs(pool),
  },
  {
    path: "/multiAsset/validateNFT/:fingerprint",
    method: "post",
    handler: handleValidateNft(pool),
  },
  {
    path: "/v2.1/multiAsset/validateNFT/:fingerprint",
    method: "post",
    handler: handleValidateNft(pool),
  },
  {
    path: "/tx/status",
    method: "post",
    handler: handleTxStatus(pool),
  },
  {
    path: "/v2.1/tx/status",
    method: "post",
    handler: handleTxStatus(pool),
  },
  {
    path: "/multiAsset/policyIdExists",
    method: "post",
    handler: handlePolicyIdExists(pool),
  },
  {
    path: "/v2.1/multiAsset/policyIdExists",
    method: "post",
    handler: handlePolicyIdExists(pool),
  },
  {
    path: "/v2/importerhealthcheck",
    method: "get",
    handler: async (_req: Request, res: Response) => {
      const status = healthChecker.getStatus();
      if (status === "OK") res.send({ code: 200, message: "Importer is OK" });
      else if (status === "BLOCK_IS_STALE")
        res.send({
          code: 200,
          message:
            "Importer seems OK. Not enough time has passed since last valid request.",
        });
      else throw new Error(status);
    },
  },
  {
    path: "/v2.1/importerhealthcheck",
    method: "get",
    handler: async (_req: Request, res: Response) => {
      const status = healthChecker.getStatus();
      if (status === "OK") res.send({ code: 200, message: "Importer is OK" });
      else if (status === "BLOCK_IS_STALE")
        res.send({
          code: 200,
          message:
            "Importer seems OK. Not enough time has passed since last valid request.",
        });
      else throw new Error(status);
    },
  },
  { path: "/status", method: "get", handler: getStatus },
  { path: "/v2.1/status", method: "get", handler: getStatus },
  {
    path: "/v0/catalyst/fundInfo",
    method: "get",
    handler: getFundInfo,
  },
  {
    path: "/v2.1/catalyst/fundInfo",
    method: "get",
    handler: getFundInfo,
  },
];

applyRoutes(routes, router);
installCoinPriceHandlers(router, pool);
router.use(middleware.logErrors);
router.use(middleware.errorHandler);
router.use(Sentry.Handlers.errorHandler());

const server = http.createServer(router);

const wss = new websockets.Server({ server });
wss.on("connection", connectionHandler(pool));

server.listen(port, async () => {
  console.log(
    "current pool work_mem",
    (await pool.query("SHOW work_mem;")).rows[0].work_mem
  );
  console.log(
    "current pool max_parallel_workers",
    (await pool.query("SHOW max_parallel_workers;")).rows[0]
      .max_parallel_workers
  );

  console.log("setting new values for work_mem & max_parallel_workers");
  await pool.query(`SET work_mem=${config.get("postgresOptions.workMem")};`);
  await pool.query(
    `SET max_parallel_workers=${config.get(
      "postgresOptions.maxParallelWorkers"
    )};`
  );

  console.log(
    "new pool work_mem",
    (await pool.query("SHOW work_mem;")).rows[0].work_mem
  );
  console.log(
    "new pool max_parallel_workers",
    (await pool.query("SHOW max_parallel_workers;")).rows[0]
      .max_parallel_workers
  );

  console.log(`listening on ${port}...`);
});
