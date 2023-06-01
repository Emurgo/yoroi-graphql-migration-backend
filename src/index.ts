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
} from "./utils";
import * as middleware from "./middleware";

import { handleSignedTx } from "./services/signedTransaction";
import { handlePoolInfo } from "./services/poolInfo";
import { handleGetAccountState } from "./services/accountState";
import { handleGetRegHistory } from "./services/regHistory";
import { handleGetRewardHistory } from "./services/rewardHistory";
import { handleTxStatus } from "./services/txStatus";

import { HealthChecker } from "./HealthChecker";

import { createCertificatesView } from "./Transactions/certificates";
import { createTransactionOutputView } from "./Transactions/output";
import { createValidUtxosView } from "./Transactions/valid_utxos_view";
import { createUtxoFunctions } from "./Transactions/utxoFunctions";
import { createTransactionUtilityFunctions } from "./Transactions/userDefinedFunctions";
import { handleGetCardanoWalletPools } from "./services/cardanoWallet";

import { handleMessageBoard } from "./services/messageBoard";
import { handleMessageDirect } from "./services/messageDirect";

import { handleOracleDatapoint } from "./services/oracleDatapoint";
import { handleOracleTicker } from "./services/oracleTicker";

import { getFundInfo } from "./services/catalyst";

import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";

import installCoinPriceHandlers from "./coin-price/handler";

import { neo } from "./neo4j";

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

const healthChecker = new HealthChecker(() => neo.bestblock.getBestBlock());

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
    path: "/account/rewardHistory",
    method: "post",
    handler: handleGetRewardHistory(pool),
  },
  {
    path: "/messages/getMessageBoard",
    method: "post",
    handler: handleMessageBoard(pool),
  },
  {
    path: "/messages/getMessageDirect",
    method: "post",
    handler: handleMessageDirect(pool),
  },
  {
    path: "/oracles/getDatapoints",
    method: "post",
    handler: handleOracleDatapoint(pool),
  },
  {
    path: "/oracles/getTickers",
    method: "post",
    handler: handleOracleTicker(pool),
  },
  {
    path: "/pool/cardanoWallet",
    method: "get",
    handler: handleGetCardanoWalletPools(pool),
  },
  {
    path: "/tx/status",
    method: "post",
    handler: handleTxStatus(pool),
  },
  {
    path: "/account/registrationHistory",
    method: "post",
    handler: neo.account.registrationHistory.handler,
  },
  {
    path: "/pool/info",
    method: "post",
    handler: neo.pool.info.handler
  },
  {
    path: "/pool/delegationHistory",
    method: "post",
    handler: neo.pool.delegationHistory.handler,
  },
  // regular endpoints
  {
    path: "/v2/bestblock",
    method: "get",
    handler: neo.bestblock.handler
  },
  {
    path: "/v2/tipStatus",
    method: "get",
    handler: neo.tipStatus.get.handler
  },
  {
    path: "/v2/tipStatus",
    method: "post",
    handler: neo.tipStatus.post.handler
  },
  {
    path: "/v2/txs/utxoAtPoint",
    method: "post",
    handler: neo.txs.utxoAtPoint.handler
  },
  {
    path: "/v2/txs/utxoDiffSincePoint",
    method: "post",
    handler: neo.txs.utxoDiffSincePoint.handler,
  },
  {
    path: "/v2/addresses/filterUsed",
    method: "post",
    handler: neo.addresses.filterUsed.handler,
  },
  {
    path: "/txs/utxoForAddresses",
    method: "post",
    handler: neo.txs.utxoForAddresses.handler,
  },
  {
    path: "/txs/utxoSumForAddresses",
    method: "post",
    handler: neo.txs.utxoSumForAddresses.handler
  },
  {
    path: "/v2/txs/history",
    method: "post",
    handler: neo.txs.history.handler,
  },
  {
    path: "/txs/io/:tx_hash",
    method: "get",
    handler: neo.txs.io.handler
  },
  {
    path: "/txs/io/:tx_hash/o/:index",
    method: "get",
    handler: neo.txs.ioByIndex.handler
  },
  {
    path: "/v2/txs/get",
    method: "post",
    handler: neo.txs.get.handler,
  },
  {
    path: "/multiAsset/supply",
    method: "post",
    handler: neo.multiAsset.supply.handler
  },
  {
    path: "/multiAsset/metadata",
    method: "post",
    handler: neo.multiAsset.metadata.handler
  },
  {
    path: "/asset/:fingerprint/mintTxs",
    method: "get",
    handler: neo.asset.mintTxs.handler,
  },
  {
    path: "/multiAsset/validateNFT/:fingerprint",
    method: "post",
    handler: neo.multiAsset.validateNFT.handler
  },
  {
    path: "/multiAsset/policyIdExists",
    method: "post",
    handler: neo.multiAsset.policyIdExists.handler,
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
  { path: "/status", method: "get", handler: getStatus },
  {
    path: "/v0/catalyst/fundInfo",
    method: "get",
    handler: getFundInfo,
  },
  {
    path: "/txs/signed",
    method: "post",
    handler: handleSignedTx
  },

  // v2.1 endpoints
  {
    path: "/v2.1/account/state",
    method: "post",
    handler: handleGetAccountState(pool),
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/account/rewardHistory",
    method: "post",
    handler: handleGetRewardHistory(pool),
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/messages/getMessageBoard",
    method: "post",
    handler: handleMessageBoard(pool),
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/messages/getMessageDirect",
    method: "post",
    handler: handleMessageDirect(pool),
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/oracles/getDatapoints",
    method: "post",
    handler: handleOracleDatapoint(pool),
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/oracles/getTickers",
    method: "post",
    handler: handleOracleTicker(pool),
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/pool/cardanoWallet",
    method: "get",
    handler: handleGetCardanoWalletPools(pool),
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/tx/status",
    method: "post",
    handler: handleTxStatus(pool),
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/account/registrationHistory",
    method: "post",
    handler: neo.account.registrationHistory.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/pool/info",
    method: "post",
    handler: neo.pool.info.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/pool/delegationHistory",
    method: "post",
    handler: neo.pool.delegationHistory.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/bestblock",
    method: "get",
    handler: neo.bestblock.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/lastBlockBySlot",
    method: "post",
    handler: neo.lastBlockBySlot.handler,
  },
  {
    path: "/v2.1/tipStatus",
    method: "get",
    handler: neo.tipStatus.get.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/tipStatus",
    method: "post",
    handler: neo.tipStatus.post.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/txs/utxoAtPoint",
    method: "post",
    handler: neo.txs.utxoAtPoint.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/txs/utxoDiffSincePoint",
    method: "post",
    handler: neo.txs.utxoDiffSincePoint.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/addresses/filterUsed",
    method: "post",
    handler: neo.addresses.filterUsed.handler,
    interceptor: middleware.handleCamelCaseResponse
  },
  {
    path: "/v2.1/txs/utxoForAddresses",
    method: "post",
    handler: neo.txs.utxoForAddresses.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/txs/utxoSumForAddresses",
    method: "post",
    handler: neo.txs.utxoSumForAddresses.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/txs/history",
    method: "post",
    handler: neo.txs.history.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/txs/io/:tx_hash",
    method: "get",
    handler: neo.txs.io.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/txs/io/:tx_hash/o/:index",
    method: "get",
    handler: neo.txs.ioByIndex.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/txs/get",
    method: "post",
    handler: neo.txs.get.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/txs/signed",
    method: "post",
    handler: handleSignedTx,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/multiAsset/supply",
    method: "post",
    handler: neo.multiAsset.supply.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/multiAsset/metadata",
    method: "post",
    handler: neo.multiAsset.metadata.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/asset/:fingerprint/mintTxs",
    method: "get",
    handler: neo.asset.mintTxs.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/multiAsset/validateNFT/:fingerprint",
    method: "post",
    handler: neo.multiAsset.validateNFT.handler,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/multiAsset/policyIdExists",
    method: "post",
    handler: neo.multiAsset.policyIdExists.handler,
    interceptor: middleware.handleCamelCaseResponse,
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
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/status",
    method: "get",
    handler: getStatus,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/catalyst/fundInfo",
    method: "get",
    handler: getFundInfo,
    interceptor: middleware.handleCamelCaseResponse,
  },
  {
    path: "/v2.1/txs/summaries",
    method: "post",
    handler: neo.txs.summaries.handler,
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
