import http from "http";
import express from "express";
import { Request, Response } from "express";
import axios from 'axios';

import { Pool } from 'pg';

import { applyMiddleware, applyRoutes, contentTypeHeaders, graphqlEndpoint, Route } from "./utils";
import * as utils from "./utils";
import * as middleware from "./middleware";

import { askBestBlock } from "./services/bestblock";
import { askUtxoForAddresses } from "./services/utxoForAddress";
import { askBlockNumByHash, askBlockNumByTxHash, askTransactionHistory } from "./services/transactionHistory";
import { askFilterUsedAddresses } from "./services/filterUsedAddress";
import { askUtxoSumForAddresses } from "./services/utxoSumForAddress";

import { HealthChecker } from "./HealthChecker";


const pool = new Pool({user: 'hasura', host:'/tmp/', database: 'cexplorer'});

const healthChecker = new HealthChecker(askBestBlock);

const router = express();

const middlewares = [ middleware.handleCors
                    , middleware.handleBodyRequestParsing 
                    , middleware.handleCompression 
                    ];

applyMiddleware(middlewares, router);



const port = 8082;
const addressesRequestLimit = 50;
const apiResponseLimit = 50; 

const bestBlock = async (req: Request, res: Response) => {
  const result = await askBestBlock();
  switch(result.kind) {
    case "ok":
      const cardano = result.value;
      res.send({
        epoch: cardano.currentEpoch.number,
        slot: cardano.currentEpoch.blocks[0].slotWithinEpoch ,
        hash: cardano.currentEpoch.blocks[0].hash,
        height: cardano.blockHeight,
      });

      return;
    case "error":
      throw new Error(result.errMsg);
      return;
    default: return utils.assertNever(result);
  };
};

const utxoForAddresses = async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
      throw new Error("error, no addresses.");
      return;
  }
  const verifiedAddresses = utils.validateAddressesReq(addressesRequestLimit
                                                      , req.body.addresses);
  switch(verifiedAddresses.kind){
      case "ok": 
          const result = await askUtxoForAddresses(verifiedAddresses.value);
          switch(result.kind)
          {
            case "ok":
              const utxos = result.value.map( utxo => 
                                            ({
                                              utxo_id: `${utxo.txHash}:${utxo.index}`,
                                              tx_hash: utxo.txHash,
                                              tx_index: utxo.index,
                                              receiver: utxo.address,
                                              amount: utxo.value,
                                              block_num: utxo.transaction.block.number,
                                            }));
              res.send(utxos);
              return;
            case "error":
              throw new Error(result.errMsg);
              return;
            default: return utils.assertNever(result);

          }
      case "error":
          throw new Error(verifiedAddresses.errMsg);
          return;
      default: return utils.assertNever(verifiedAddresses);
  }
};


const filterUsedAddresses = async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
      throw new Error("error, no addresses.");
      return;
  }
  const verifiedAddresses = utils.validateAddressesReq(addressesRequestLimit
                                                      , req.body.addresses);
  switch(verifiedAddresses.kind){
      case "ok": 
          const result = await askFilterUsedAddresses(verifiedAddresses.value);
          switch(result.kind){
            case "ok":
              const resultSet = new Set(result.value.flatMap( tx => [tx.inputs, tx.outputs]).flat().map(x => x.address));
              const verifiedSet = new Set(verifiedAddresses.value);
              const intersection = new Set();
              for (let elem of resultSet)
                  if(verifiedSet.has(elem))
                      intersection.add(elem);
              res.send([...intersection]);
              return;
            case "error":
              throw new Error(result.errMsg);
              return;
            default: return utils.assertNever(result);
          }
          return;
      case "error":
          throw new Error(verifiedAddresses.errMsg);
          return;
      default: return utils.assertNever(verifiedAddresses);
  }
};



const utxoSumForAddresses = async (req:  Request, res:Response) => {
  if(!req.body || !req.body.addresses) {
      throw new Error("error, no addresses.");
      return;
  }
  const verifiedAddresses = utils.validateAddressesReq(addressesRequestLimit
                                                      , req.body.addresses);
  switch(verifiedAddresses.kind){
      case "ok": 
          const result = await askUtxoSumForAddresses(verifiedAddresses.value);
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
      case "error":
          throw new Error(verifiedAddresses.errMsg);
          return;
      default: return utils.assertNever(verifiedAddresses);
  }
};

const txHistory = async (req: Request, res: Response) => {
    if(!req.body){
      throw new Error("error, no body");
      return;
    }
    const verifiedBody = utils.validateHistoryReq(addressesRequestLimit, apiResponseLimit, req.body);
    switch(verifiedBody.kind){
        case "ok":
            const body = verifiedBody.value;
            const limit = body.limit || apiResponseLimit;
            const [referenceTx, referenceBlock] = (body.after && [body.after.tx, body.after.block]) || [];
            const referenceBestBlock = body.untilBlock;
            const untilBlockNum = await askBlockNumByHash(referenceBestBlock);
            const afterBlockNum = await askBlockNumByTxHash(referenceTx );

            if(untilBlockNum.kind === 'error' && untilBlockNum.errMsg !== utils.errMsgs.noValue) {
              const msg = `untilBlockNum failed: ${untilBlockNum.errMsg}`;
              throw new Error("txHistory: "+msg);
              return;
            }
            if(afterBlockNum.kind === 'error' && afterBlockNum.errMsg !== utils.errMsgs.noValue) {
              const msg = `afterBlockNum failed: ${afterBlockNum.errMsg}`;
              throw new Error("tsHistory: "+msg);
              return;
            }

            const maybeTxs = await askTransactionHistory(pool, limit, body.addresses, afterBlockNum, untilBlockNum);
            switch(maybeTxs.kind) {
              case "ok":
                const txs = maybeTxs.value.map( tx => ({
                    hash: tx.hash,
                    tx_ordinal: tx.txIndex,
                    tx_state: 'Successful', // graphql doesn't handle pending/failed txs
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
              case "error":
                throw new Error(maybeTxs.errMsg);
                return;
              default: return utils.assertNever(maybeTxs);
            }
            return;
        case "error":
            throw new Error(verifiedBody.errMsg);
            return;
        default: return utils.assertNever(verifiedBody);
    }
};

const routes : Route[] = [ { path: '/v2/bestblock'
                 , method: "get"
                 , handler: bestBlock
                 }
               , { path: '/v2/addresses/filterUsed'
                 , method: "post"
                 , handler: filterUsedAddresses
                 }
               , { path: '/txs/utxoForAddresses'
                 , method: "post"
                 , handler: utxoForAddresses
                 }
               , { path: '/txs/utxoSumForAddresses'
                 , method: "post"
                 , handler: utxoSumForAddresses
                 }
               , { path: '/v2/txs/history'
                 , method: "post"
                 , handler: txHistory 
                 }
               , { path: '/v2/importerhealthcheck'
                 , method: "get"
                 , handler: async (req: Request, res: Response) => {
                     const status = healthChecker.getStatus()
                     if (status === 'OK')
                         res.send({ code: 200, message: "Importer is OK" });
                     else if (status === 'SLOW')
                         res.send({ code: 200, message: "Importer seems OK. Not enough time has passed since last valid request." });
                     else 
                         throw new Error(status);
                   }
                 }
               , { path: '/status'
                 , method: "get"
                 , handler: async (req: Request, res: Response) => {
                     res.send({ isServerOk: true }); 
                   }
                 }
               ]

applyRoutes(routes, router);
router.use(middleware.logErrors);
router.use(middleware.errorHandler);

const server = http.createServer(router);

server.listen(port, () =>
    console.log(`listening on ${port}...`)
);

