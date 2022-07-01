import { Request, Response } from "express";
import { Db } from "mongodb";

export const bestBlockHandler = (
  db: Db
) => async (
  req: Request, res: Response
) => {
  const blocksCollection = db.collection("blocks");

  const cursor = blocksCollection.find({
  }, {
    sort: {
      slot: -1
    },
    limit: 1,
    projection: {
      epoch: "$epoch",
      slot: "$epoch_slot",
      globalSlot: "$slot",
      hash: "$hash",
      height: "$number"
    }
  });

  const bestBlock = await cursor.next();
  if (!bestBlock) throw new Error("could not find any blocks");

  return res.send({
    epoch: bestBlock.epoch,
    slot: bestBlock.slot,
    globalSlot: bestBlock.globalSlot,
    hash: bestBlock.hash,
    height: bestBlock.height,
  });
};