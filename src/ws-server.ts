import { Pool } from "pg";

const MSG_TYPE_RESTORE = "RESTORE";
// const ADDR_LENGTH_LIMIT = 2000;
// const ADDR_VALID_STARTS = ["Ddz", "Ae2"];

const restoreUtxo = async(pool: Pool): Promise<string[]> => {
  const ret = await pool.query("select distinct address from \"Utxo\" where address like 'Ddz%' or address like 'Ae2'");
  return ret.rows.map( (row :any) => row.address);
};

export const connectionHandler = (pool: Pool) => {

  return (ws : WebSocket) => {
    ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      switch(data.msg) {
      case MSG_TYPE_RESTORE: {
        restoreUtxo(pool)
          .then( (addresses) => {
            ws.send(JSON.stringify({ msg: MSG_TYPE_RESTORE, addresses: addresses }));
          })
          .catch( (error) => {console.log(error);}); }
      }
    };
  };
};
