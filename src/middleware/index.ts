import { NextFunction, Request, Response, Router } from "express";
import cors from "cors";
import parser from "body-parser";
import compression from "compression";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import responseTime from "response-time";

export const handleCors = (router: Router): Router =>
  router.use(cors({ credentials: true, origin: true }));

export const handleBodyRequestParsing = (router: Router): void => {
  router.use(parser.urlencoded({ extended: true }));
  router.use(parser.json());
};

export const handleCompression = (router: Router): void => {
  router.use(compression());
};

export const handleTiming = (router: Router): void => {
  router.use(
    responseTime((req: Request, res: Response, time: number) => {
      console.log(
        `[CALLTIME] millis=${time} url=${req.url} body=${JSON.stringify(
          req.body
        )}`
      );
    })
  );
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
