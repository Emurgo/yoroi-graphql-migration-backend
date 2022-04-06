import { Pool } from "pg";
import { Request, Response } from "express";

const getAssetMintMetadata = async (pool: Pool, fingerprint: string) => {
  const query = `
  select encode(ma.policy, 'hex') as policy,
    encode(ma.name, 'hex') as asset,
    ma.fingerprint,
    json_agg(
        cast ('{"hash": "' || encode(tx.hash, 'hex') || '"}' as jsonb)
        || jsonb_build_object('metadata', cast ('{"key": ' || meta.key || '}' as jsonb)
            || jsonb_build_object('json', meta.json))
    ) as txs
from ma_tx_mint mint
    join multi_asset ma on mint.ident = ma.id
    join tx on mint.tx_id = tx.id
    left join tx_metadata meta on tx.id = meta.tx_id
where ma.fingerprint = $1
group by ma.policy,
    ma.name,
    ma.fingerprint;`;

  const results = await pool.query(query, [fingerprint]);
  return results.rows.map(x => ({
    policy: x.policy,
    name: x.asset,
    txs: x.txs
  }));
};

export const handleGetAssetMintTxs =
  (pool: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.params.fingerprint) throw new Error("missing fingerprint in request params");

    const metadata = await getAssetMintMetadata(pool, req.params.fingerprint);
    res.send(metadata);
  };
