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


export class ResponseErr extends Error {
  statusCode: number
  constructor(msg: string, statusCode = 500) {
    super(msg);
    this.statusCode = statusCode;
  }
}

export const errorHandler = (
  err: Error | ResponseErr,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err instanceof ResponseErr ? err.statusCode : 500;
  const message = err.message;
  res.status(statusCode).send({ error: { response: message } });
};
