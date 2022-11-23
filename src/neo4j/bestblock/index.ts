import { Driver } from "neo4j-driver";
import { Request, Response } from "express";
import { CardanoFrag } from "../../Transactions/types";
import { UtilEither } from "../../utils";

export const bestblock = (driver: Driver) => ({
  getBestBlock: async (): Promise<UtilEither<CardanoFrag>> => {
    const session = driver.session();
  
    const result = await session.run(`
    MATCH (b:Block)
    WITH MAX(ID(b)) as max_block_id
    
    MATCH (block:Block)
    WHERE ID(block) = max_block_id
    RETURN {
        epoch: block.epoch,
        slot: block.epoch_slot,
        globalSlot: block.slot,
        hash: block.hash,
        height: block.number
    } as block`);
    const bestBlock = result.records[0].get(0).properties;
  
    session.close();
  
    return {
      kind: "ok",
      value: {
        epoch: bestBlock.epoch.toNumber(),
        slot: bestBlock.slot.toNumber(),
        globalSlot: bestBlock.globalSlot.toNumber(),
        hash: bestBlock.hash,
        height: bestBlock.height.toNumber()
      } as any
    };
  },
  handler: async (_: Request, res: Response) => {
    const cypher = `MATCH (b:Block)
    WITH MAX(ID(b)) as max_block_id
    
    MATCH (block:Block)
    WHERE ID(block) = max_block_id
    RETURN {
        epoch: block.epoch,
        slot: block.epoch_slot,
        globalSlot: block.slot,
        hash: block.hash,
        height: block.number
    } as block`;

    const session = driver.session();

    const results = await session.run(cypher);

    await session.close();

    const block = results.records[0].get("block");

    return res.send({
      epoch: block.epoch.toNumber(),
      slot: block.slot.toNumber(),
      globalSlot: block.globalSlot.toNumber(),
      hash: block.hash,
      height: block.height.toNumber()
    });
  }
});