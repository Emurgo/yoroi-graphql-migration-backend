import { Driver } from "neo4j-driver";
import { Request, Response } from "express";
import { CardanoFrag } from "../../Transactions/types";
import { UtilEither } from "../../utils";

export const bestblock = (driver: Driver) => ({
  getBestBlock: async (): Promise<UtilEither<CardanoFrag>> => {
    const session = driver.session();

    try {
      const result = await session.run(`
      MATCH (block:BESTBLOCK)
      RETURN {
          epoch: block.epoch,
          slot: block.epoch_slot,
          globalSlot: block.slot,
          hash: block.hash,
          height: block.number
      } as block`);
      const bestBlock = result.records[0].get(0).properties;
    
      return {
        kind: "ok",
        value: {
          epoch: bestBlock.epoch,
          slot: bestBlock.slot,
          globalSlot: bestBlock.globalSlot,
          hash: bestBlock.hash,
          height: bestBlock.height
        } as any
      };
    } finally {
      await session.close();
    }
  },
  handler: async (_: Request, res: Response) => {
    const cypher = `MATCH (block:BESTBLOCK)
    RETURN {
        epoch: block.epoch,
        slot: block.epoch_slot,
        globalSlot: block.slot,
        hash: block.hash,
        height: block.number
    } as block`;

    const session = driver.session();

    try {
      const results = await session.run(cypher);

      const block = results.records[0].get("block");

      return res.send({
        epoch: block.epoch,
        slot: block.slot,
        globalSlot: block.globalSlot,
        hash: block.hash,
        height: block.height
      });
    } finally {
      await session.close();
    }
  }
});