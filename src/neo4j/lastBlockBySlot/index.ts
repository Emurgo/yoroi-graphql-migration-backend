import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";

const MAX_SLOTS = 50;

export const lastBlockBySlot = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const { slots } = req.body;

    let err: string | null = null;
    if (!slots) err = "Missing 'slots' in the request body";
    else if (!(slots instanceof Array))
      err = "'slots' is required to be an array";
    else if (slots.length === 0) err = "'slots' is required to be non-empty";
    else if (slots.length > MAX_SLOTS)
      err = "The maximum number of slots allowed is " + MAX_SLOTS;
    else if (
      slots.some(
        (s) =>
          !(s instanceof Array) ||
          s.length != 2 ||
          typeof s[0] !== "number" ||
          typeof s[1] !== "number"
      )
    )
      err = "Each slot entry should be a tuple of two numbers: epoch and slot.";
    if (err !== null) {
      return res.status(400).json({ error: err });
    }

    const cypher = `CALL {
                      MATCH (b:Block)
                      WHERE (b.epoch < $epoch)
                      RETURN b
                      ORDER BY b.epoch DESCENDING, b.epoch_slot DESCENDING
                      LIMIT 1
                      
                      UNION
                      MATCH (b:Block)
                      WHERE  (b.epoch = $epoch AND b.epoch_slot <= $epochSlot)
                      RETURN b ORDER BY b.epoch DESCENDING, b.epoch_slot DESCENDING
                      LIMIT 1
                    }
                    RETURN b.hash as hash ORDER BY b.epoch DESCENDING, b.epoch_slot DESCENDING
                    LIMIT 1`;

    const blockHashes: { [key: string]: string | null } = {};

    await Promise.all(
      slots.map(async (slot: string[]) => {
        const epoch = slot[0];
        const epochSlot = slot[1];

        const session = driver.session();

        const result = (await session.run(cypher, { epoch: epoch, epochSlot: epochSlot })).records[0];

        let value: string | null;
        if (result) {
          value = result.get("hash");
        }
        else {
          value = null;
        }

        await session.close();

        const key = `${epoch},${epochSlot}`;
        blockHashes[key] = value;
      })
    );

    return res.send({ blockHashes });
  }
});