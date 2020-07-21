import axios from "axios";

import { contentTypeHeaders, graphqlEndpoint, UtilEither} from "../utils";

interface TransactionFrag {
    inputs: AddressFrag[];
    outputs: AddressFrag[];
}

interface AddressFrag {
    address: string;
}

export const askFilterUsedAddresses = async (addresses: string[]): Promise<UtilEither<TransactionFrag[]>> => {
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
  const ret = await axios.post(graphqlEndpoint,
    JSON.stringify({query:query, variables:{addresses: addresses}}),
    contentTypeHeaders);
    
  if("data" in ret && "data" in ret.data && "transactions" in ret.data.data)
    return { kind: "ok", value: ret.data.data.transactions };
  else return { kind: "error", errMsg:"FilterUsed, could not understand graphql response" };
};
