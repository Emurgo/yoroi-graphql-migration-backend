import { UtilEither} from "../utils";

export const askUtxoSumForAddresses = async (addresses: string[]): Promise<UtilEither<string>> => {
  // TODO: support for payment keys
  // const query = `
  //           query UtxoForAddresses($addresses: [String]) {
  //             utxos_aggregate(where: {
  //               address: {
  //                 _in: $addresses
  //               }
  //             }) {
  //               aggregate {
  //                 sum {
  //                   value
  //                 }
  //               }
  //             }
  //           }
  //   `;
  // const ret = await axios.post(graphqlEndpoint,
  //   JSON.stringify({ "query": query, "variables": {"addresses":addresses} }),
  //   contentTypeHeaders);
  // if(   "data" in ret && "data" in ret.data
  //      && "utxos_aggregate" in ret.data.data
  //      && "aggregate" in ret.data.data.utxos_aggregate
  //      && "sum" in ret.data.data.utxos_aggregate.aggregate
  //      && "value" in ret.data.data.utxos_aggregate.aggregate.sum)
  //   return { kind: "ok", value: ret.data.data.utxos_aggregate.aggregate.sum.value };
  // else
    return { kind: "error", errMsg: "utxoSumforAddresses endpoint not available."};
};
