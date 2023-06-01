import { Request, Response } from "express";
import { toInteger } from "lodash";
import { Driver } from "neo4j-driver-core";

export const utxoSumForAddresses = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const cypher = `MATCH(o:TX_OUT)
    WHERE o.address IN $addresses AND NOT (o)-[:sourceOf]->(:TX_IN)
    WITH o
    RETURN {
        amount: o.amount,
        assets: o.assets
    } as record`;

    const session = driver.session();
    try {
      const result = await session.run(cypher, { addresses: req.body.addresses });

      const response = {} as any;

      if (result.records && result.records.length > 0) {

        for (let i = 0; i < result.records.length; i++) {
          const record = result.records[i].get("record");
          const newAmount = toInteger(record.amount);
          const oldAmount = toInteger(response.sum);
          response.sum = (newAmount + oldAmount).toString();

          const assets = record.assets;
          if (assets && assets.length > 0) {
            const newAssets = JSON.parse(assets).map((a: any) => {
              return {
                amount: a.amount.toString(),
                assetId: a.policy + "." + a.asset,
              };
            });

            for (let j = 0; j < newAssets.length; j++) {
              const newAsset = newAssets[j];

              if (!response.tokensBalance) {
                response.tokensBalance = [];
              }
              
              const existingAsset = response.tokensBalance.find((a: any) => a.assetId === newAsset.assetId);
              if (existingAsset) {
                existingAsset.amount = (toInteger(existingAsset.amount) + toInteger(newAsset.amount)).toString();
              } else {
                response.tokensBalance.push(newAsset);
              }
            }
          }
        }

      }

      return res.send(response);
    } finally {
      await session.close();
    }
  }
});