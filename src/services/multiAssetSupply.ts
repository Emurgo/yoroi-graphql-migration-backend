import { Pool } from "pg";
import { Request, Response } from "express";

interface Asset {
  name: string;
  policy: string;
}

export const handleGetMultiAssetSupply =
  (pool: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.body || !req.body.assets)
      throw new Error("missing assets on request body");
    if (!Array.isArray(req.body.assets))
      throw new Error("assets should be an array");
    if (req.body.assets.length > 100)
      throw new Error("Max limit of 100 assets exceeded.");
    if (req.body.assets.length === 0)
      throw new Error("assets should not be empty");
    if (req.body.assets.find((a: any) => !a.policy))
      throw new Error("all assets on body should have a name and a policy");

    const assets: Asset[] = req.body.assets;

    const supplies: { [key: string]: number } = {};

    await Promise.all(
      assets.map(async (asset) => {
        const supply = await getMultiAssetSupply(pool, asset);

        const policyAndName = `${asset.policy}.${asset.name}`;

        supplies[policyAndName] = supply;
      })
    );

    res.send({
      supplies,
    });
  };

const getMultiAssetSupply = async (
  pool: Pool,
  asset: Asset
): Promise<number> => {
  const query = `
    select sum(mint.quantity) as supply
    from multi_asset
    join ma_tx_mint mint on multi_asset.id = mint.ident
    where
      multi_asset.name = ($1)::bytea and multi_asset.policy = decode(($2)::varchar, 'hex')`;

  const result = await pool.query(query, [asset.name, asset.policy]);

  if (result.rows.length === 0)
    throw new Error("asset no found: " + asset.name);

  return parseFloat(result.rows[0].supply);
};
