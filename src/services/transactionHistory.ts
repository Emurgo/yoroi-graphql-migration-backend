import axios from 'axios';
import { Request, Response } from "express";

import { assertNever, contentTypeHeaders, errMsgs, graphqlEndpoint, UtilEither} from "../utils";

interface TransactionFrag {
    hash: string;
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

export const askTransactionHistory = async ( 
           limit: number
         , addresses: string[]
         , afterNum: UtilEither<number>
         , untilNum: UtilEither<number>) : Promise<UtilEither<TransactionFrag[]>> => {
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
                  includedAt: asc
                }
              ) {
                hash
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


export const askBlockNumByTxHash = async (hash : string|undefined): Promise<UtilEither<number>> => {
    if(!hash)
        return {kind:'error', errMsg: errMsgs.noValue};

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
    let ret = null;
    try {
      ret = (await axios.post(graphqlEndpoint,
                        JSON.stringify({ 'query': query, 'variables': {'hashId':hash} }),
                        contentTypeHeaders));
    } catch (err) {
      return { kind: 'error', errMsg: 'askBlockNumByTxHash, unable to query graphql service: ' + err };
    }
    if('data' in ret 
       && 'data' in ret.data 
       && 'transactions' in ret.data.data
       && Array.isArray(ret.data.data.transactions))
      if(   ret.data.data.transactions > 0
         && 'block' in ret.data.data.transactions[0]
         && 'number' in ret.data.data.transactions[0].block)
         
        return {kind:'ok', value:ret.data.data.transaction[0].block.number};
      else
        return { kind:'error', errMsg: errMsgs.noValue };
    else 
        return {kind:'error', errMsg: 'Did not understand graphql response'};
} ;

export const askBlockNumByHash = async (hash : string) : Promise<UtilEither<number>> => {
    const query = `
            query BlockNumByHash($id: Hash32HexString!) {
              blocks(
                where: {
                  hash: {
                    _eq: $id
                  }
                }
              ) {
                number
              }
            }
    `;
    let ret = null;
    try {
      ret = await axios.post(graphqlEndpoint,
                        JSON.stringify({ 'query': query, 'variables': {'id':hash} }),
                        contentTypeHeaders);
    } catch (err) {
      return { kind:'error', errMsg: 'askBlockNumByHash, unable to query graphql service: ' + err };
    }
    if('data' in ret 
       && 'data' in ret.data 
       && 'blocks' in ret.data.data
       && Array.isArray(ret.data.data.blocks))
      if(   ret.data.data.blocks.length > 0 
         && 'number' in ret.data.data.blocks[0])
        return {kind:'ok', value:ret.data.data.blocks[0].number};
      else
        return { kind:'error', errMsg: errMsgs.noValue };
    else 
        return {kind:'error', errMsg: 'askBlockNumByHash, Did not understand graphql response'};

};
