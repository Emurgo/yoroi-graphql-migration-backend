import axios from "axios";
import config from "config";

import { Request, Response } from "express";

export const getFundInfo = async (_: Request, res: Response) => {
  const response = await axios.get(
    config.get("iog.fundInfoEndpoint")
  );
  if (response.data) {
    const chainVotePlan = response.data.chain_vote_plans.reduce(
      (prev: any, curr: any) => {
        if (!prev.id) return curr;
        if (prev.id > curr.id) return prev;
        return curr;
      },
      {} as any
    );
    return res.send({
      currentFund: {
        id: 8,
        registrationStart: response.data.fund_start_time,
        registrationEnd: response.data.fund_end_time,
        votingStart: chainVotePlan.chain_vote_start_time,
        votingEnd: chainVotePlan.chain_vote_end_time,
        votingPowerThreshold: Math.floor(
          response.data.voting_power_threshold / 1_000_000
        ).toString(),
      },
    });
  }

  return res.status(500).send();
};
