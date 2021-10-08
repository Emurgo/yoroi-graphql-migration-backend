import { Pool } from "pg";
import { Request, Response } from "express";

interface Asset {
  name: string
  policy: string
}

interface MultiAssetTxMintMetadata {
  key: string
  metadata: any
}

const getMultiAssetTxMintMetadata = async (pool: Pool, assets: Asset[]) => {
  const query = createGetMultiAssetTxMintMetadataQuery(assets);

  const params = assets
    .map(a => [a.name, a.policy])
    .reduce((prev, curr) => prev.concat(curr), []);

  const ret: {[key: string]: MultiAssetTxMintMetadata[]} = {};

  const results = await pool.query(query, params);
  for (const row of results.rows) {
    const policyAndName = `${row.policy}.${row.asset}`;
    if (!ret[policyAndName]) {
      ret[policyAndName] = new Array<MultiAssetTxMintMetadata>();
    }

    ret[policyAndName].push({
      key: row.key,
      metadata: row.json
    });
  }

  return ret;
};

export const handleGetMultiAssetTxMintMetadata = (pool: Pool) => async (req: Request, res:Response): Promise<void> => {
  if (!req.body || !req.body.assets) throw new Error("missing assets on request body");
  if (!Array.isArray(req.body.assets)) throw new Error("assets should be an array");
  if (req.body.assets.length === 0) throw new Error("assets should not be empty");
  if (req.body.assets.find((a: any) => !a.policy)) throw new Error("all assets on body should have a name and a policy");

  const assets: Asset[] = req.body.assets;

  const metadata = await getMultiAssetTxMintMetadata(pool, assets);
  res.send(metadata);
};

function createGetMultiAssetTxMintMetadataQuery(assets: Asset[]) {
  const whereConditions = assets
    .map((a, idx) => `( mint.name = ($${idx * 2 + 1})::bytea
      and encode(mint.policy, 'hex') = ($${idx * 2 + 2})::varchar )`)
    .join(" or ");

  const query = `
  select encode(mint.policy, 'hex') as policy,
    mint.name as asset,
    meta.key,
    meta.json
  from ma_tx_mint mint
    join tx on mint.tx_id = tx.id
    join tx_metadata meta on tx.id = meta.tx_id
  where ${whereConditions}`;
  return query;
}
