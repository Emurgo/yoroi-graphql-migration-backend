import axios from "axios";

import { contentTypeHeaders, graphqlEndpoint, UtilEither} from "../utils";

interface UtxoFrag {
  address: string;
  txHash: string;
  index: number
  value: string;
  transaction: TransactionFrag;
}

interface TransactionFrag {
    block: BlockFrag;
}

interface BlockFrag {
    number: number;
}


export const askUtxoForAddresses = async (addresses: string[]) : Promise<UtilEither<UtxoFrag[]>> => {
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
                transaction {
                      block { number }
                }
              }
            }`;
  const ret = await axios.post(graphqlEndpoint, 
    JSON.stringify({query: query, variables: { addresses: addresses}}),
    contentTypeHeaders);
  if("data" in ret && "data" in ret.data && Array.isArray(ret.data.data.utxos))
    return { kind: "ok", value: ret.data.data.utxos };
  else
    return { kind: "error", errMsg: "utxoForAddresses, could not understand graphql response" };
};

