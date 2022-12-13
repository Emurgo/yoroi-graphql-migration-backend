import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";

export const supply = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {
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

    const assets: any[] = req.body.assets;

    const params: { [key: string]: string } = {};
    const whereParts = [] as string[];

    let c = 0;

    for (const asset of assets) {
      const assetHexName = Buffer.from(asset.name, "utf8").toString("hex");

      const assetKey = `asset${c}`;
      const policyKey = `policy${c}`;

      params[assetKey] = assetHexName;
      params[policyKey] = asset.policy;

      whereParts.push(`(m.asset = $${assetKey} AND m.policy = $${policyKey})`);

      c++;
    }

    const cypher = `MATCH (m:MINT)
    WHERE (${whereParts.join(" OR ")}) 
    RETURN {
        policy: m.policy,
        asset: m.asset,
        quantity: m.quantity
    } as asset`;

    const session = driver.session();
    try {
      const result = await session.run(cypher, params);

      const r: any = {};
      r.supplies = {};

      for (const asset of assets) {
        const key = `${asset.policy}.${asset.name}`;
        r.supplies[key] = null;
      }

      for (const record of result.records) {
        const asset = record.get("asset");
        const assetName = Buffer.from(asset.asset, "hex").toString("utf8");

        const key = `${asset.policy}.${assetName}`;
        const quantity = asset.quantity.toNumber();

        if (r.supplies[key]) {
          r.supplies[key] += quantity;
        } else {
          r.supplies[key] = quantity;
        }
      }

      return res.send(r);
    } finally {
      await session.close();
    }
  }
});