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

    const cypher = `
    MATCH (m:MINT)-[:mintedAt]->(tx:TX)
    WHERE m.asset = $asset AND m.policy = $policy AND tx.metadata IS NOT NULL
    WITH DISTINCT m.asset as asset, m.policy as policy, collect(tx.metadata) as metadatas
    WITH DISTINCT asset, policy, [metadatas[size(metadatas) - 1]] as metadatas
    RETURN asset, policy, metadatas
    `;

    const getForAsset = async (asset: any) => {
      const name = asset.nameHex
        ? asset.nameHex
        : Buffer.from(asset?.name ?? "").toString("hex");

      const session = driver.session();

      try {
        const result = await session.run(cypher, {
          asset: name,
          policy: asset.policy,
        });
  
        if (result.records.length === 0) return null;
  
        const record = result.records[0];
  
        const assetName = Buffer.from(record.get("asset"), "hex").toString();
        const policy = record.get("policy");
        const metadatas = record.get("metadatas") as any[];
  
        return {
          assetName: assetName,
          policy: policy,
          metadatas: metadatas,
        };
      } finally {
        await session.close();
      }
    };
    
    const promises = assets.map((asset) => getForAsset(asset));
    const results = await Promise.all(promises);

    const r = results.reduce((prev, curr) => {
    
      if (!curr) return prev;

      const {
        assetName,
        policy,
        metadatas,
      } = curr;

      if (metadatas.length > 0) {
        const key = `${policy}.${assetName}`;

        if (!prev[key]) {
          prev[key] = [];
        }
  
        for (const meta of metadatas) {
          const metaObjs = JSON.parse(meta) as any[];
          for (const metaObj of metaObjs) {
            if (metaObj.label === "721" || metaObj.label === "20") {
              if (metaObj.map_json[policy]) {
                if (metaObj.map_json[policy][assetName]) {
                  const obj = {
                    key: metaObj.label,
                    metadata: metaObj.map_json
                  };
          
                  prev[key].push(obj);
                }
              }
            } else {
              const obj = {
                key: metaObj.label,
                metadata: metaObj.map_json
              };
      
              prev[key].push(obj);
            }
          }
        }
      }

      return prev;
    }, {} as {[key: string]: any[]});

    return res.send(r);
  }
});