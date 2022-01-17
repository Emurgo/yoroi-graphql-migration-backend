import { Pool } from "pg";
import { Request, Response } from "express";

export const handlePolicyIdExists =
  (pool: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.body || !req.body.policyIds) {
      throw new Error("error, no policyIds informed.");
    }
    if (!Array.isArray(req.body.policyIds)) {
      throw new Error("'policyIds should be an array.");
    }

    const policyIds: string[] = req.body.policyIds;

    if (policyIds.length > 100) {
      throw new Error("Max limit of 100 policyIds exceeded.");
    }
    if (policyIds.length === 0) {
      throw new Error("error, at least 1 policyId should be informed.");
    }

    const result = await pool.query(query, [policyIds]);

    const policyIdResults: { [key: string]: boolean } = {};

    policyIds.forEach((policyId: string) => {
      policyIdResults[policyId] = false;
    });

    result.rows.forEach((row: any) => {
      policyIdResults[row.policy_hex] = true;
    });

    res.send({
      policyIdResults,
    });
  };

const query = `
  SELECT encode(policy, 'hex') as policy_hex FROM multi_asset
  WHERE encode(policy, 'hex') = ANY($1);`;
