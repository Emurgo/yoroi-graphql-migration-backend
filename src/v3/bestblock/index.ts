import { Driver } from "neo4j-driver";
import { Request, Response } from "express";

export const bestblock = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {
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