import { Pool } from "pg";

const MSG_TYPE_RESTORE = "RESTORE";

const restoreUtxo = async (pool: Pool): Promise<string[]> => {
  /*
    byron-era addresses don't have staking keys so this is an optimization
    Ae2 addresses & enterprise addresses also have no staking keys, so we still have to check the address format
    
    Note: fortunately none of the long addresses start with Ddz
  */
  const ret = await pool.query(`
    select distinct address
    from "utxo_view"
    where
      stake_address_id is NULL
      and address like 'Ddz%'
  `);
  return ret.rows.map((row: any) => row.address);
};

export const connectionHandler = (pool: Pool) => {
  return (ws: WebSocket) => {
    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.msg) {
          case MSG_TYPE_RESTORE: {
            restoreUtxo(pool)
              .then((addresses) => {
                ws.send(
                  JSON.stringify({
                    msg: MSG_TYPE_RESTORE,
                    addresses: addresses,
                  })
                );
              })
              .catch((error) => {
                console.log(error);
              });
          }
        }
      } catch (e: any) {
        const errorStr = e.stack == null ? e : e.stack;
        console.log(`Failed when processing websocket request\n${errorStr}`);
      }
    };
  };
};
