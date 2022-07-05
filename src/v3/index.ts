import * as config from "./config";
import { Router } from "express";
import { applyRoutes, Route } from "../utils";
import { txsHistoryHandler } from "./endpoints/txs/history";
import { bestBlockHandler } from "./endpoints/best-block";
import { utxoForAddressesHandler } from "./endpoints/txs/utxo-for-addresses";
import { txOutputHandler } from "./endpoints/txs/output";
import { utxoSumForAddressesHandler } from "./endpoints/txs/utxo-sum-for-addresses";
import { filterUsedHandler } from "./endpoints/addresses/filterUsed";
import { multiAssetSupplyHandler } from "./endpoints/multiAsset/supply";
import { txsIoHandler } from "./endpoints/txs/io";
import { MongoClient } from "mongodb";

const mongoClient = new MongoClient(config.mongoDbConnectionString);

export const applyV3Routes = (router: Router) => {
  const routes: Route[] = [
    {
      path: "/v3/txs/history",
      method: "post",
      handler: txsHistoryHandler(mongoClient)
    },
    {
      path: "/v3/bestblock",
      method: "get",
      handler: bestBlockHandler(mongoClient)
    },
    {
      path: "/v3/txs/utxoForAddresses",
      method: "post",
      handler: utxoForAddressesHandler(mongoClient),
    },
    {
      path: "/v3/txs/utxoSumForAddresses",
      method: "post",
      handler: utxoSumForAddressesHandler(mongoClient),
    },
    {
      path: "/v3/addresses/filterUsed",
      method: "post",
      handler: filterUsedHandler(mongoClient),
    },
    {
      path: "/v3/multiAsset/supply",
      method: "post",
      handler: multiAssetSupplyHandler(mongoClient)
    },
    {
      path: "/v3/txs/io/:tx_hash",
      method: "get",
      handler: txsIoHandler(mongoClient)
    },
    {
      path: "/v3/txs/io/:tx_hash/o/:index",
      method: "get",
      handler: txOutputHandler(mongoClient)
    }
  ];
  applyRoutes(routes, router);
};