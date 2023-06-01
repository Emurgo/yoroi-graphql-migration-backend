import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import { formatNeo4jBigNumber } from "../txs/utils";

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

    const cypher = `MATCH (m:MINT)
    WHERE m.asset = $asset AND m.policy = $policy
    RETURN sum(m.quantity) as supply`;

    const r: any = {
      supplies: {}
    };
    
    const promises = assets.map(async (asset) => {
      const key = `${asset.policy}.${asset.name}`;

      const session = driver.session();
      try {
        const assetHexName = Buffer.from(asset.name, "utf8").toString("hex");

        const result = await session.run(cypher, {
          asset: assetHexName,
          policy: asset.policy,
        });

        const record = result.records[0];
        const quantity = formatNeo4jBigNumber(record.get("supply"), "number");

        r.supplies[key] = quantity;

        return r;
      } finally {
        await session.close();
      }
    });

    await Promise.all(promises);

    return res.send(r);
  }
});