import { Driver } from "neo4j-driver";
import { Request, Response } from "express";
import config from "config";

const SAFE_BLOCK_DEPTH = parseInt(config.get("safeBlockDifference"));

const getBestAndSafeBlocks = async (driver: Driver) => {
  const bestBlockCypher = `MATCH (block:BESTBLOCK)
  RETURN {
      epoch: block.epoch,
      slot: block.epoch_slot,
      globalSlot: block.slot,
      hash: block.hash,
      height: block.number
  } as block`;

  const safeBlockCypher = `MATCH (bestBlock:BESTBLOCK)
  WITH bestBlock
  
  MATCH (b:Block)
  WHERE b.number = bestBlock.number - $safeBlockDepth
  RETURN {
      epoch: b.epoch,
      slot: b.epoch_slot,
      globalSlot: b.slot,
      hash: b.hash,
      height: b.number
  } as block
  ORDER BY b.number DESC 
  LIMIT 1`;

  const session1 = driver.session();
  const session2 = driver.session();

  try {
    const [bestBlockResult, safeBlockResult] = await Promise.all([
      session1.run(bestBlockCypher),
      session2.run(safeBlockCypher, { safeBlockDepth: SAFE_BLOCK_DEPTH }),
    ]);
  
    const bestBlock = bestBlockResult.records[0].get("block");
    const safeBlock = safeBlockResult.records[0].get("block");
  
    return {
      bestBlock: {
        epoch: bestBlock.epoch,
        slot: bestBlock.slot,
        globalSlot: bestBlock.globalSlot,
        hash: bestBlock.hash,
        height: bestBlock.height,
      },
      safeBlock: {
        epoch: safeBlock.epoch.toNumber(),
        slot: safeBlock.slot.toNumber(),
        globalSlot: safeBlock.globalSlot.toNumber(),
        hash: safeBlock.hash,
        height: safeBlock.height,
      },
    };
  } finally {
    await session1.close();
    await session2.close();
  }
};

export const tipStatus = (driver: Driver) => ({
  get: {
    handler: async (_: Request, res: Response) => {
      const { bestBlock, safeBlock } = await getBestAndSafeBlocks(driver);

      return res.send({
        bestBlock,
        safeBlock
      });
    }
  },
  post: {
    handler: async (req: Request, res: Response) => {
      if (!req.body.reference) {
        throw new Error("error, missing reference");
      }
  
      if (!req.body.reference.bestBlocks) {
        throw new Error("error, missing bestBlocks inside reference");
      }

      const bestBlocks: string[] = req.body.reference.bestBlocks;
      if (!Array.isArray(bestBlocks)) {
        throw new Error("error, bestBlocks should be an array");
      }

      if (bestBlocks.length === 0) {
        throw new Error("error, bestBlocks should not be empty");
      }

      const bestBlockCypher = `MATCH (b:Block)
      WHERE b.hash IN $hashes
      RETURN {
          hash: b.hash,
          blockNumber: b.number
      } as block
      ORDER BY b.number DESC LIMIT 1`;

      const safeBlockCypher = `MATCH (b:Block)
      WITH MAX(b.number) as maxBlockNumber
      
      MATCH (b:Block)
      WHERE b.hash IN $hashes
      WITH b, maxBlockNumber
      WHERE b.number <= maxBlockNumber - $safeBlockDepth
      RETURN {
          hash: b.hash,
          blockNumber: b.number
      } as block
      ORDER BY b.number DESC LIMIT 1`;

      const session1 = driver.session();
      const session2 = driver.session();

      try {
        const [
          { bestBlock, safeBlock },
          bestBlockFromReferenceResult,
          safeBlockFromReferenceResult,
        ] = await Promise.all([
          getBestAndSafeBlocks(driver),
          session1.run(bestBlockCypher, { hashes: bestBlocks }),
          session2.run(safeBlockCypher, {
            hashes: bestBlocks,
            safeBlockDepth: SAFE_BLOCK_DEPTH,
          }),
        ]);
  
        if (bestBlockFromReferenceResult.records.length === 0) {
          throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
        }
        const lastFoundBestBlock: string =
          bestBlockFromReferenceResult.records[0].get("block").hash;
  
        if (safeBlockFromReferenceResult.records.length === 0) {
          throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
        }
        const lastFoundSafeBlock: string =
          safeBlockFromReferenceResult.records[0].get("block").hash;
    
        res.send({
          safeBlock,
          bestBlock,
          reference: {
            lastFoundSafeBlock,
            lastFoundBestBlock,
          },
        });
      } finally {
        await session1.close();
        await session2.close();
      }
    }
  }
});