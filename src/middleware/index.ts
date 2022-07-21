import { NextFunction, Request, Response, Router } from "express";
import cors from "cors";
import parser from "body-parser";
import compression from "compression";
import camelizeKeys from "./utils";

export const handleCors = (router: Router): Router =>
  router.use(cors({ credentials: true, origin: true }));

export const handleBodyRequestParsing = (router: Router): void => {
  router.use(parser.urlencoded({ extended: true }));
  router.use(parser.json());
};

export const handleCompression = (router: Router): void => {
  router.use(compression());
};

export const handleCamelCaseResponse = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const send = res.send;
  res.send = function (body?: Buffer | string | boolean | Array<any>) {
    if (typeof body === "object" && body != null) {
      send.call(this, camelizeKeys(body));
    } else {
      send.call(this, body);
    }
    return res;
  };
  next();
};

export const logErrors = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errStr = `ERROR url: ${req.url}\n      stack: ${
    err.stack
  }\n      message: ${err.message}\n      request: ${JSON.stringify(req.body)}`;
  console.log(errStr);
  next(err);
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  res.status(500).send({ error: { response: err.message } });
};
