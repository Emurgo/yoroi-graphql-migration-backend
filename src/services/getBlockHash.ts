import { Request, Response } from "express";
import { Pool } from "pg";

const query = `
  SELECT hash, epoch_no, slot_no FROM block WHERE (epoch_no, slot_no) IN ( ( 1, 23761) );
`;

type BlockHash = [number, number];
export const hanldeGetBlockHashBySlot =
  (pool: Pool) =>
  async (req: Request<any, any, { slots: Array<[number , number]>}>, res: Response): Promise<void> => {
    const { slots } = req.body;

    let err: string | null  = null;
    if (!slots) err = "Missing 'slots' in the request body";
    else if (!( slots instanceof Array )) err = "'slots' is required to be an array";
    else if (slots.length === 0) err = "'slots' is required to be non-empty";
    else if (slots.length > 50) err = "The maximum number of slots allowed in the request is 50";
    else if (slots.some(s => !( s instanceof Array) || s.length != 2)) err = "Each slot entry should be a tuple of two numbers: epoch and slot.";
    if (err !== null) throw new Error(err);

    // if (
    //     !(slots instanceof Array) || 
    //     slots.length === 0 || 
    //     slots.length > 50 || 
    //     slots.some(s => !(s instanceof Array) || s.length != 2) 
    // )
    //     throw new Error(`The field 'slots' is required and is required to be a non-empty array. Each entry is a tuple of two numbers: epoch and slot.`);


    
    const result = await pool.query("SELECT hash, epoch_no, slot_no FROM block LIMIT 20;", [
        // [1, 2, 3, 4, 5]
    ]);
    res.status(200).json(result.rows);
  };
