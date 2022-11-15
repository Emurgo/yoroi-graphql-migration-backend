import { Driver } from "neo4j-driver";
import { Request, Response } from "express";

export const utxoDiffSincePoint = (driver: Driver) => ({
  handler: async (_: Request, res: Response) => {
    return res.send({});
  }
});