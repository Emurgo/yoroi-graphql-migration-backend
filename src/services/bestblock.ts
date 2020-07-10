import axios from 'axios';
import { Request, Response } from "express";

import { assertNever, contentTypeHeaders, graphqlEndpoint, UtilEither} from "../utils";

export interface CardanoFrag {
  blockHeight: number;
  currentEpoch: EpochFrag;
  slotDuration: number;
}

export interface EpochFrag {
    blocks: BlockFrag[];
    number: number;
}

export interface BlockFrag {
    hash: string;
    number: number;
    slotWithinEpoch: number;
}

export const askBestBlock = async () : Promise<UtilEither<CardanoFrag>> => {
    const query = `
                {
                  cardano {
                    blockHeight,
                    currentEpoch {
                      number
                      blocks(limit:1, order_by: { createdAt:desc}) {
                        hash
                        number
                        slotWithinEpoch
                      }
                    }
                  },
                }
            `;
    const ret = await axios.post(graphqlEndpoint, JSON.stringify({'query':query}), contentTypeHeaders);
    if('data' in ret && 'data' in ret.data && 'cardano' in ret.data.data)
        return { kind: 'ok', value: ret.data.data.cardano };
    else return { kind: 'error', errMsg:'BestBlock, could not understand graphql response' };
};

