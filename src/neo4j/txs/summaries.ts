import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";

export const io = (_: Driver) => ({
  handler: async (req: Request, res: Response) => {
    return res.send({todo: true});
  }
});