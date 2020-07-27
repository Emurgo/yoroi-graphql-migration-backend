import axios from "axios";

import {  contentTypeHeaders, graphqlEndpoint, UtilEither} from "../utils";

export interface CardanoFrag {
  currentEpoch: EpochFrag;
}

export interface EpochFrag {
    blocks: BlockFrag[];
    number: number;
}

export interface BlockFrag {
    hash: string;
    number: number;
    slotNo: number;
}

export const askBestBlock = async () : Promise<UtilEither<CardanoFrag>> => {
  const query = `
                {
                  cardano {
                    currentEpoch {
                      number
                      blocks(limit:1, order_by: { forgedAt:desc}) {
                        hash
                        number
                        slotNo
                      }
                    }
                  },
                }
            `;
  const ret = await axios.post(graphqlEndpoint, JSON.stringify({"query":query}), contentTypeHeaders);
  if("data" in ret && "data" in ret.data && "cardano" in ret.data.data)
    return { kind: "ok", value: ret.data.data.cardano };
  else return { kind: "error", errMsg:"BestBlock, could not understand graphql response" };
};

