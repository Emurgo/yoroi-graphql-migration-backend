import { Pool } from "pg";
import { Request, Response } from "express";

type Asset =
  | {
      // prefer this one
      nameHex: string;
      policy: string;
    }
  | {
      // for backward compatibility
      name: string;
      policy: string;
    };

interface MultiAssetTxMintMetadata {
  key: string;
  metadata: any;
}

const getMultiAssetTxMintMetadata = async (pool: Pool, assets: Asset[]) => {
  const query = createGetMultiAssetTxMintMetadataQuery(assets);

  const params = assets.flatMap((a) => {
    if ("nameHex" in a) {
      return [a.nameHex, a.policy];
    }
    if ("name" in a) {
      return [a.name, a.policy];
    }
    throw new Error("expect nameHex or name in asset parameter");
  });

  const ret: { [key: string]: MultiAssetTxMintMetadata[] } = {};

  const results = await pool.query(query, params);
  for (const row of results.rows) {
    const policyAndName = `${row.policy}.${row.asset}`;
    if (!ret[policyAndName]) {
      ret[policyAndName] = new Array<MultiAssetTxMintMetadata>();
    }

    ret[policyAndName].push({
      key: row.key,
      metadata: row.json,
    });
  }

  return ret;
};

export const handleGetMultiAssetTxMintMetadata =
  (pool: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.body || !req.body.assets)
      throw new Error("missing assets on request body");
    if (!Array.isArray(req.body.assets))
      throw new Error("assets should be an array");
    if (req.body.assets.length === 0)
      throw new Error("assets should not be empty");
    if (req.body.assets.length > 100)
      throw new Error("Max limit of 100 assets exceeded.");
    if (req.body.assets.find((a: any) => !a.policy))
      throw new Error("all assets on body should have a name and a policy");

    const assets: Asset[] = req.body.assets;

    const metadata = await getMultiAssetTxMintMetadata(pool, assets);
    res.send(metadata);
  };

function createGetMultiAssetTxMintMetadataQuery(assets: Asset[]) {
  const whereConditions = assets
    .map((a, idx) => {
      let nameMatch;
      if ("nameHex" in a) {
        nameMatch = `decode(($${idx * 2 + 1})::varchar, 'hex')`;
      } else if ("name" in a) {
        nameMatch = `($${idx * 2 + 1})::bytea`;
      } else {
        throw new Error("expect nameHex or name in asset parameter");
      }
      return `( ma.name = ${nameMatch} and ma.policy = decode(($${
        idx * 2 + 2
      })::varchar, 'hex') )`;
    })
    .join(" or ");

  const query = `
WITH mint_detail AS (
  SELECT max(mint.id) id, name, policy
    FROM ma_tx_mint mint
    JOIN multi_asset ma on mint.ident = ma.id
   where ${whereConditions}
   GROUP BY name, policy),
     mint_tx AS (
  SELECT tx_id, name, policy
    FROM ma_tx_mint mint 
    JOIN mint_detail d ON mint.id = d.id)
  select encode(mint.policy, 'hex') as policy,
    mint.name as asset,
    meta.key,
    meta.json, mint.tx_id
  from mint_tx mint
    join tx tx on mint.tx_id = tx.id
    join tx_metadata meta on tx.id = meta.tx_id`;
  return query;
}
