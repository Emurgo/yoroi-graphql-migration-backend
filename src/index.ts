import http from "http";
import express from "express";
import { Request, Response } from "express";

import axios from 'axios';

import * as _ from 'lodash';

import { applyMiddleware, applyRoutes, Route } from "./utils";
import * as utils from "./utils";
import * as middleware from "./middleware";


const router = express();

const middlewares = [ middleware.handleCors
                    , middleware.handleBodyRequestParsing 
                    , middleware.handleCompression 
                    ];

applyMiddleware(middlewares, router);

const graphqlEndpoint = 'http://localhost:3100/graphq';
const port = 8082;
const addressesRequestLimit = 50;
const apiResponseLimit = 50; 


const contentTypeHeaders = { headers: {'Content-Type': 'application/json'}};
const askBestBlock = () => {
    const query = `
                {
                  cardano {
                    blockHeight,
                    currentEpoch {
                      number
                      blocks(limit:1, order_by: { createdAt:desc}) {
                        hash
                        number
                      }
                    },
                    slotDuration,
                  },
                }
            `;
    return axios.post(graphqlEndpoint, JSON.stringify({'query':query}), contentTypeHeaders);
};

const bestBlock = async (req: Request, res: Response) => {
  const { cardano } = (await askBestBlock()).data.data;
  res.send({
    epoch: cardano.currentEpoch.number,
    slot: cardano.slotDuration,
    hash: cardano.currentEpoch.blocks[0].hash,
    height: cardano.blockHeight,
  });
};

const askFilterUsedAddresses = (addresses: string[]) => {
    const query = `
                    query UsedAddresses($addresses: [String!]) {
                      transactions(where: {
                        _or: [
                          {
                            inputs: {
                              address: {
                                _in: $addresses
                            }
                          }},
                          {
                            outputs: {
                              address: {
                                _in: $addresses
                            }
                          }}
                        ]
                      }) {
                        inputs {
                          address
                        }
                        outputs {
                          address
                        }
                      }
                    }
                  `;
    console.log(JSON.stringify({query, addresses}))
    return axios.post(graphqlEndpoint,
                     JSON.stringify({query, addresses}),
                     contentTypeHeaders);
};

const askBlockNumByTxHash = async (hash : string): Promise<utils.UtilEither<number>> => {
    const query = `
            query BlockNumByTxHash($hashId: Hash32HexString!) {
              transactions(
                where: {
                  hash: {
                    _eq: $hashId
                  }
                }
              ) {
                hash
                block {
                  number
                }
              }
            }`;
    const ret = (await axios.post(graphqlEndpoint,
                      JSON.stringify({ 'query': query, 'variables': {'hashId':hash} }),
                      contentTypeHeaders));
    if('data' in ret 
       && 'data' in ret.data 
       && 'transactions' in ret.data.data
       && ret.data.data.transactions[0] 
       && 'block' in ret.data.data.transactions[0]
       && 'number' in  ret.data.data.transactions[0].block
       && typeof ret.data.data.transaction[0].block.number === 'number')
       return {kind:'ok', value:ret.data.data.transaction[0].block.number};
    else 
        return {kind:'error', errMsg: 'Did not understand graphql response'};


} ;

const askBlockNumByHash = async (hash : string) : Promise<utils.UtilEither<number>> => {
    const query = `
            query BlockNumByHash($id: Hash32HexString!) {
              blocks(
                where: {
                  id: {
                    _eq: $id
                  }
                }
              ) {
                id
                number
              }
            }
    `;
    const ret = (await axios.post(graphqlEndpoint,
                      JSON.stringify({ 'query': query, 'variables': {'hashId':hash} }),
                      contentTypeHeaders));
    if('data' in ret 
       && 'data' in ret.data 
       && 'transactions' in ret.data.data
       && ret.data.data.transactions[0] 
       && 'block' in ret.data.data.transactions[0]
       && 'number' in  ret.data.data.transactions[0].block
       && typeof ret.data.data.transaction[0].block.number === 'number')
       return {kind:'ok', value:ret.data.data.transaction[0].block.number};
    else 
        return {kind:'error', errMsg: 'Did not understand graphql response'};

};

const askUtxoForAddresses = (addresses: string[]) => {
    const query = `
            query UtxoForAddresses($addresses: [String]) {
              utxos(where: {
                address: {
                  _in: $addresses
                }
              }) {
                address
                txHash
                index
                value
                utxo_tx {
                      block { number }
                }
              }
            }`;
    return axios.post(graphqlEndpoint, 
                      JSON.stringify({query, addresses}),
                      contentTypeHeaders);
};

const askUtxoSumForAddresses = (addresses: string[]) => {
    const query = `
            query UtxoForAddresses($addresses: [String]) {
              utxos_aggregate(where: {
                address: {
                  _in: $addresses
                }
              }) {
                aggregate {
                  sum {
                    value
                  }
                }
              }
            }
    `;
    return axios.post(graphqlEndpoint,
                      JSON.stringify({ 'query': query, 'variables': {'addresses':addresses} }),
                      contentTypeHeaders);
};

interface TransactionFrag {
    id: string;
    block: BlockFrag;
    includedAt: Date;
    inputs: TransInputFrag;
    outputs: TransInputFrag; // technically a TransactionOutput fragment
}
interface BlockFrag {
    number: number;
    hash: string;
    epochNo: number;
    slotNo: number;
}
interface TransInputFrag {
    address: string;
    value: string;
}

const askTransactionHistory = async ( 
           limit: number
         , addresses: string[]
         , afterNum: utils.UtilEither<number>
         , untilNum: utils.UtilEither<number>) : Promise<utils.UtilEither<TransactionFrag[]>> => {
    const query = `
            query TxsHistory($addresses: [String], $limit: Int, $afterBlockNum: Int, $untilBlockNum: Int) {
              transactions(
                where: {
                  _and:
                  [
                    {
                      block: {
                        number: {
                          _gte: $afterBlockNum,
                          _lte: $untilBlockNum
                        }
                      }
                    },
                    {
                      _or: [
                    {
                      inputs: {
                        address: {
                          _in: $addresses
                        }
                      }
                    },
                    {
                      outputs: {
                        address: {
                          _in: $addresses
                        }
                      }
                    }
                  ]
                    }
                  ]
                },
                limit: $limit,
                order_by: {
                  includedAt: desc
                }
              ) {
                id
                block {
                  number
                  hash
                  epochNo
                  slotNo
                }
                includedAt
                inputs {
                  address
                  value
                }
                outputs {
                  address
                  value
                }
              }
            }
    `;
    const ret = await axios.post(graphqlEndpoint,
                      JSON.stringify({ 'query': query,
                                       'variables': {'addresses':addresses,
                                                     'limit': limit,
                                                     'afterBlockNum': afterNum.kind === 'ok'? afterNum.value : null,
                                                     'untilBlockNum': untilNum.kind === 'ok'? untilNum.value : null} }),
                      contentTypeHeaders);
    if('data' in ret && 'data' in ret.data && 'transactions' in ret.data.data)
        return {'kind':'ok', value:ret.data.data.transactions};
    else
        return {'kind':'error', errMsg:'TxsHistory, could not understand graphql response'};


};

const filterUsedAddresses = async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
      console.log("error, no addresses.");
      return;
  }
  const verifiedAddresses = utils.validateAddressesReq(addressesRequestLimit
                                                      , req.body.addresses);
  switch(verifiedAddresses.kind){
      case "ok": 
          const result = (await askFilterUsedAddresses(verifiedAddresses.value)).data.data;
          const usedAddresses = _.chain(result.transactions)
                                 .flatMap(tx => [...tx.inputs, ...tx.outputs])
                                 .map('address')
                                 .intersection(verifiedAddresses.value)
                                 .value();

          res.send(usedAddresses);
          return;
      case "error":
          console.log(verifiedAddresses.errMsg);
          return;
      default: return utils.assertNever(verifiedAddresses);
  }
};


const utxoForAddresses = async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
      console.log("error, no addresses.");
      return;
  }
  const verifiedAddresses = utils.validateAddressesReq(addressesRequestLimit
                                                      , req.body.addresses);
  switch(verifiedAddresses.kind){
      case "ok": 
          const result = (await askUtxoForAddresses(verifiedAddresses.value)).data.data;
          const utxos = Array.isArray(result)
                        ? result.map( utxo => 
                                        ({
                                          utxo_id: `${utxo.txId}:${utxo.index}`,
                                          tx_hash: utxo.txHash,
                                          tx_index: utxo.index,
                                          receiver: utxo.address,
                                          amount: utxo.value,
                                          block_num: utxo.utxo_tx.block.number,
                                        }))
                        : []
          res.send(utxos)
          return;
      case "error":
          console.log(verifiedAddresses.errMsg);
          return;
      default: return utils.assertNever(verifiedAddresses);
  }
};

const utxoSumForAddresses = async (req:  Request, res:Response) => {
  if(!req.body || !req.body.addresses) {
      console.log("error, no addresses.");
      return;
  }
  const verifiedAddresses = utils.validateAddressesReq(addressesRequestLimit
                                                      , req.body.addresses);
  switch(verifiedAddresses.kind){
      case "ok": 
          const result = (await askUtxoSumForAddresses(verifiedAddresses.value)).data.data;
          res.send(result);
          return;
      case "error":
          console.log(verifiedAddresses.errMsg);
          return;
      default: return utils.assertNever(verifiedAddresses);
  }
};

const txHistory = async (req: Request, res: Response) => {
    if(!req.body){
        console.log("error, no body");
        return;
    }
    const verifiedBody = utils.validateHistoryReq(addressesRequestLimit, apiResponseLimit, req.body);
    switch(verifiedBody.kind){
        case "ok":
            const body = verifiedBody.value;
            const limit = body.limit || apiResponseLimit;
            const [referenceTx, referenceBlock] = (body.after && [body.after.tx, body.after.block]) || [];
            const referenceBestBlock = body.untilBlock;

            const afterBlockNum = await askBlockNumByTxHash(referenceTx ? referenceTx : "");
            const untilBlockNum = await askBlockNumByHash(referenceBestBlock);
            const maybeTxs = await askTransactionHistory(limit, body.addresses, afterBlockNum, untilBlockNum);
            switch(maybeTxs.kind) {
              case "ok":
                const txs = maybeTxs.value.map( tx => ({
                    hash: tx.id,
                    is_reference: tx.id === referenceTx,
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
                const refs = txs.filter( ({ is_reference }) => is_reference );

                if(referenceTx !== undefined){
                    if(refs.length !== 1){
                        console.log(`
                         graphql response with ${refs.length} rows for 
                         refTx ${referenceTx} and refBestBlock ${referenceBestBlock}`);
                        return;
                    }

                    const { block_num: reference_block_height, hash, block_hash, tx_state } = refs[0];
                    if (!hash) {
                      console.log(`Reference transaction '${referenceTx}' is not found!`);
                      return;
                    }
                    if (block_hash !== referenceBlock) {
                      console.log(`
                        Reference block '${referenceBlock}' for reference tx 
                        '${referenceTx}' not match real block '${block_hash}' 
                        (reference status is '${tx_state}')!`);
                      return;
                    }
                    if (!reference_block_height) {
                      console.log(`
                        Reference bestblock '${referenceBestBlock}' does not 
                        exist in the history!`);
                      return;
                    }
                }
                res.send(txs);

                return;
              case "error":
                console.log(maybeTxs.errMsg);
                return;
              default: return utils.assertNever(maybeTxs);

            }

            return;
        case "error":
            console.log(verifiedBody.errMsg);
            return;
        default: return utils.assertNever(verifiedBody);
    }
};

const routes : Route[] = [ { path: '/bestblock'
                 , method: "get"
                 , handler: bestBlock
                 }
               , { path: '/addresses/filterUsed'
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
               , { path: '/txs/history'
                 , method: "post"
                 , handler: txHistory 
                 }
               ]

applyRoutes(routes, router);

const server = http.createServer(router);

server.listen(port, () =>
    console.log(`listening on ${port}...`)
);

