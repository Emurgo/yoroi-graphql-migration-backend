import { Request, Response } from "express";
import { Pool } from "pg";

const query = `
    SELECT encode(hash, 'hex') as hash
    FROM   block
    WHERE  epoch_no = $1 AND slot_no <= $2
    ORDER  BY slot_no DESC
    LIMIT  1; 
`;

type EpochNo = number;
type SlotNo = number;
type Slot = [EpochNo, SlotNo];
const MAX_SLOTS = 50;

export const hanldeGetBlockHashBySlot =
  (pool: Pool) =>
  async (
    req: Request<any, any, { slots: Array<Slot> }>,
    res: Response
  ): Promise<void> => {
    const { slots } = req.body;

    let err: string | null = null;
    if (!slots) err = "Missing 'slots' in the request body";
    else if (!(slots instanceof Array)) err = "'slots' is required to be an array";
    else if (slots.length === 0) err = "'slots' is required to be non-empty";
    else if (slots.length > MAX_SLOTS) err = "The maximum number of slots allowed is " + MAX_SLOTS;
    else if (slots.some((s) => !(s instanceof Array) || s.length != 2))
      err = "Each slot entry should be a tuple of two numbers: epoch and slot.";
    if (err !== null) throw new Error(err);

    const blockHashes: { [key: string]: string | null } = {};

    const result = await Promise.all(
      slots.map((slot) =>
        pool
          .query(query, [slot[0], slot[1]])
          .then((res) => ({ rows: res.rows, slot }))
      )
    );

    result.forEach((res) => {
      blockHashes[res.slot as any] =
        res.rows.length != 0 ? res.rows[0].hash : null;
    });

    res.status(200).json({
      blockHashes,
    });
  };
