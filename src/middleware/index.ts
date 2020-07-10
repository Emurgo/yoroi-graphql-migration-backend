import {  NextFunction, Request, Response, Router,  } from "express";
import cors from "cors";
import parser from "body-parser";
import compression from "compression";

export const handleCors = (router: Router) =>
  router.use(cors({ credentials: true, origin: true }));

export const handleBodyRequestParsing = (router: Router) => {
  router.use(parser.urlencoded({ extended: true }));
  router.use(parser.json());
};

export const handleCompression = (router: Router) => {
  router.use(compression());
};

export const logErrors = (err:Error, req: Request, res: Response, next: NextFunction ) => {
    const errStr = `ERROR url: ${req.url}\n      stack: ${err.stack}\n      message: ${err.message}`;
    console.log(errStr);
    next(err);
};

export const errorHandler = (err:Error, req: Request, res: Response, next: NextFunction) => {
    res.status(500).send({ error: { response: err.message }});
};
