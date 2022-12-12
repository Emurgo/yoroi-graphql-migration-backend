import { Request, Response } from "express";
import { Pool } from "pg";

const query = `
    SELECT encode(hash, 'hex') as hash, epoch_no, epoch_slot_no
    FROM   block
    WHERE (epoch_no < $1) OR (epoch_no = $1 AND epoch_slot_no <= $2)
    ORDER  BY epoch_no DESC, epoch_slot_no DESC
    LIMIT  1; 
`;

type EpochNo = number;
type SlotNo = number;
type Slot = [EpochNo, SlotNo];
const MAX_SLOTS = 50;

export const handleGetBlockHashBySlot =
  (pool: Pool) =>
  async (
    req: Request<any, any, { slots: Array<Slot> }>,
    res: Response
  ): Promise<void> => {
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
      res.status(400).json({ error: err });
      return;
    }

    const blocks = await pool.query(
      "SELECT epoch_no, epoch_slot_no, encode(hash, 'hex') as hash from block limit 5"
    );
    console.log({ blocks: blocks.rows });
    const result = await Promise.all(
      slots.map((slot) =>
        pool
          .query(query, [slot[0], slot[1]])
          .then((res) => ({ rows: res.rows, slot }))
      )
    );

    const blockHashes: { [key: string]: string | null } = {};
    result.forEach((res) => {
      const [epoch, slot] = res.slot;
      blockHashes[`${epoch},${slot}`] =
        res.rows.length != 0 ? res.rows[0].hash : null;
    });

    res.status(200).json({
      blockHashes,
    });
  };
