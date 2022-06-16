import axios from "axios";
import config from "config";

import { Request, Response } from "express";

export const getFundInfo = async (_: Request, res: Response) => {
  const catalystFundInfoPath = config.get("catalystFundInfoPath") as string;

  if (!catalystFundInfoPath) {
    res.status(503).send("missing fund info");
  } else {
    try {
      const response = await axios.get(catalystFundInfoPath);
      res.status(200).send(response.data);
    } catch {
      res.status(502).send("missing fund info");
    }
  }
};
