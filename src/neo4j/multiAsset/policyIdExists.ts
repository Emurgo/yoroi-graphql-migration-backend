import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";

export const policyIdExists = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {

    const cypherPolicyIds = `MATCH (m:MINT)
    WHERE m.policy in $policyIds
    RETURN DISTINCT {
       policy: m.policy
    } as policyId`;

    const session = driver.session();
    
    try {
      const policyIdResults: { [key: string]: boolean } = {};
      const fingerprintResults: { [key: string]: boolean } = {};

      if (req.body.policyIds && req.body.policyIds.length > 0) {
        const resultPolicyIds = await session.run(cypherPolicyIds, { policyIds: req.body.policyIds });

        const matchedPolicyIds = resultPolicyIds.records.map((r: any) => {
          return (r.get("policyId").policy).toString();
        });

        req.body.policyIds.forEach((policyId: any) => {
          policyIdResults[policyId] = matchedPolicyIds.includes(policyId);
        });
      }

      if (req.body.fingerprints && req.body.fingerprints.length > 0) {
        const cypherFingerprint = `MATCH (m:MINT)
        WHERE m.fingerprint in $fingerprints
        RETURN DISTINCT {
          fingerprint: m.fingerprint
        } as fingerprint`;

        const resultFingerptint = await session.run(cypherFingerprint, { fingerprints: req.body.fingerprints });

        const matchedFingerptints = resultFingerptint.records.map((r: any) => {
          return (r.get("fingerprint").fingerprint).toString();
        });

        req.body.fingerprints.forEach((fingerprint: any) => {
          fingerprintResults[fingerprint] = matchedFingerptints.includes(fingerprint);
        });
      }

      const results: any = {
        policyIdResults: policyIdResults,
        fingerprintResults: fingerprintResults,
      };

      return res.send(results);
    } finally {
      await session.close();
    }
  }
});