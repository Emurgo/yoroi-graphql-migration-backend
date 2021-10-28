import axios from "axios";
import config from "config";
import { Request, Response } from "express";

export const getTokenInfoHandler = async (req: Request, res: Response) => {
  const apiURL: string = config.get("server.tokenInfoFeed");

  axios.post(apiURL, req.body).then((resp) => {
    switch (resp.status) {
      case 500:
        res
          .status(500)
          .send("Problem with the token registry API server. Server error.");
        break;
      case 400:
        res.status(400).send(" Bad request token registry API server.");
        break;
      default:
        res.send(resp.data);
    }
  });
};
