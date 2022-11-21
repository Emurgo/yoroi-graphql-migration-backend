import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";

export const metadata = (driver: Driver) => ({
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

    const params: {[key: string]: string} = {};
    const whereParts = [] as string[];

    let c = 0;

    for (const asset of assets) {
      const name = asset.nameHex
        ? asset.nameHex
        : Buffer.from(asset?.name ?? "").toString("hex");

      const assetKey = `asset${c}`;
      const policyKey = `policy${c}`;

      params[assetKey] = name;
      params[policyKey] = asset.policy;

      whereParts.push(`(m.asset = $${assetKey} AND m.policy = $${policyKey})`);

      c++;
    }

    const session = driver.session();

    const cypher = `MATCH (m:MINT)-[:mintedAt]->(tx:TX)
    WHERE (${whereParts.join(" OR ")}) AND tx.metadata IS NOT NULL
    WITH DISTINCT m.asset as asset, m.policy as policy, collect(tx.metadata) as metadatas
    WITH DISTINCT asset, policy, [metadatas[size(metadatas) - 1]] as metadatas
    RETURN asset, policy, metadatas
    `;

    const result = await session.run(cypher, params);

    const r = result.records.reduce((prev, curr) => {
      
      const assetName = Buffer.from(curr.get("asset"), "hex").toString();
      const policy = curr.get("policy");
      const metadatas = curr.get("metadatas") as any[];

      if (metadatas.length > 0) {
        const key = `${policy}.${assetName}`;

        if (!prev[key]) {
          prev[key] = [];
        }
  
        for (const meta of metadatas) {
          const metaObjs = JSON.parse(meta) as any[];
          for (const metaObj of metaObjs) {
            const obj = {
              key: metaObj.label,
              metadata: metaObj.map_json
            };
    
            prev[key].push(obj);
          }
        }
      }

      return prev;
    }, {} as {[key: string]: any[]});

    await session.close();

    return res.send(r);
  }
});