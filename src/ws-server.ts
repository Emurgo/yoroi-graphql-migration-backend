import axios from "axios";
import { Pool } from "pg";
import * as websockets from "ws";

import { assertNever, contentTypeHeaders, graphqlEndpoint, UtilEither} from "./utils";

const MSG_TYPE_RESTORE = "RESTORE";
const ADDR_LENGTH_LIMIT = 2000;
const ADDR_VALID_STARTS = ["Ddz", "Ae2"];

/*
  I am not sure this is equiv to 
  SELECT DISTINCT utxos.receiver FROM utxos
  on the tangata schema, just my best guess.
*/
const GRAPHQL_QUERY = `
{
  utxos(distinct_on: address) {
    address
  }
}
`;

interface Frag {
    address: string;
}

const restoreUtxo = async(): Promise<string[]> => {
  const ret = await axios.post(graphqlEndpoint, JSON.stringify({"query": GRAPHQL_QUERY}), contentTypeHeaders);
  if ("data" in ret && "data" in ret.data && "utxos" in ret.data.data)
    return ret.data.data.utxosi
      .map( (obj: Frag) => obj.address )
      .filter( (addr: string) => addr.length < ADDR_LENGTH_LIMIT
                                        && !addr.includes("...")
                                        && (   addr.startsWith(ADDR_VALID_STARTS[0])
                                            || addr.startsWith(ADDR_VALID_STARTS[1])));
  return [];
};

export const connectionHandler = () => {

  return (ws : WebSocket) => {
    ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      switch(data.msg) {
      case MSG_TYPE_RESTORE: {
        const acceptPromise =   
        restoreUtxo().then( (addresses) => 
          ws.send(JSON.stringify({ msg: MSG_TYPE_RESTORE, addresses: addresses })))
          .catch( (error) => console.log(error)); }
      }
    };
  };
};
