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
    const fingerprints: string[] = req.body.fingerprints;

    if (policyIds.length > 100) {
      throw new Error("Max limit of 100 policyIds exceeded.");
    }

    const policyIdDbResult = await pool.query(policyIdQuery, [policyIds]);

    const policyIdResults: { [key: string]: boolean } = {};

    policyIds.forEach((policyId: string) => {
      policyIdResults[policyId] = false;
    });

    policyIdDbResult.rows.forEach((row: any) => {
      policyIdResults[row.policy_hex] = true;
    });

    const response: any = {
      policyIdResults,
    };

    if (req.body.fingerprints) {
      if (!Array.isArray(req.body.fingerprints)) {
        throw new Error("'fingerprints should be an array.");
      }

      if (fingerprints.length > 100) {
        throw new Error("Max limit of 100 fingerprints exceeded.");
      }

      const fingerprintDbResult = await pool.query(fingerprintQuery, [
        fingerprints,
      ]);

      const fingerprintResults: { [key: string]: boolean } = {};

      fingerprints.forEach((fingerprint: string) => {
        fingerprintResults[fingerprint] = false;
      });

      fingerprintDbResult.rows.forEach((row: any) => {
        fingerprintResults[row.fingerprint] = true;
      });

      response.fingerprintResults = fingerprintResults;
    }

    res.send(response);
  };

const policyIdQuery = `
  SELECT encode(policy, 'hex') as policy_hex FROM multi_asset
  WHERE encode(policy, 'hex') = ANY($1);`;

const fingerprintQuery = `
  SELECT fingerprint FROM multi_asset
  WHERE fingerprint = ANY($1);
`;
