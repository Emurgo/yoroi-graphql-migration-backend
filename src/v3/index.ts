import * as config from "./config";
import { Router } from "express";
import { applyRoutes, Route } from "../utils";
import { txsHistoryHandler } from "./endpoints/txs/history";
import { bestBlockHandler } from "./endpoints/best-block";
import { MongoClient } from "mongodb";

const mongoClient = new MongoClient(config.mongoDbConnectionString);
const db = mongoClient.db("cardano");

export const applyV3Routes = (router: Router) => {
  const routes: Route[] = [
    {
      path: "/v3/txs/history",
      method: "post",
      handler: txsHistoryHandler(db)
    },
    {
      path: "/v3/bestblock",
      method: "get",
      handler: bestBlockHandler(db)
    }
  ];
  applyRoutes(routes, router);
};