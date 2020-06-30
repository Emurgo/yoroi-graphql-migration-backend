import { Router, Request, Response, NextFunction } from "express";

export const contentTypeHeaders = { headers: {'Content-Type': 'application/json'}};
export const graphqlEndpoint = 'http://localhost:3100/graphq';

type Wrapper = ((router: Router) => void);

export const applyMiddleware = (
  middlewareWrappers: Wrapper[],
  router: Router
) => {
  for (const wrapper of middlewareWrappers) {
    wrapper(router);
  }
};

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

export interface Route {
  path: string;
  method: string;
  handler: Handler | Handler[];
};

export const applyRoutes = (routes: Route[], router: Router) => {
  for (const route of routes) {
    const { method, path, handler } = route;
    (router as any)[method](path, handler);
  }
};


export interface UtilOK<T> {
  kind: "ok";
  value: T;
}
export interface UtilErr {
  kind: "error"
  errMsg: string;
}
export type UtilEither<T> = UtilOK<T> | UtilErr;

export function assertNever(x: never): never {
    throw new Error ("this should never happen" + x);
}


/**
 * This method validates addresses request body
 * @param {Array[String]} addresses
 */
export const validateAddressesReq = (addressRequestLimit: number, addresses: string[]): UtilEither<string[]> => {
  const errorMessage = `Addresses request length should be (0, ${addressRequestLimit}]`;
  if (!addresses) {
    return { kind: "error", errMsg: errorMessage };
  } else if (addresses.length === 0 || addresses.length > addressRequestLimit) {
    return { kind: "error", errMsg: errorMessage };
  }
  return { kind: "ok", value: addresses };
};

export interface TxBlockData {
    tx: string;
    block: string;
}
export interface HistoryRequest {
  addresses: string[];
  limit?: number;
  after?: TxBlockData;
  untilBlock: string;
}

export const validateHistoryReq = (addressRequestLimit:number, apiResponseLimit:number, data: any): UtilEither<HistoryRequest> => {
    if(!('addresses' in data))
        return {kind:"error", errMsg: "body.addresses does not exist."};
    if(!('untilBlock' in data))
        return {kind:"error", errMsg: "body.untilBlock does not exist."};
    if(('after' in data) && !('tx' in data.after))
        return {kind:"error", errMsg: "body.after exists but body.after.tx does not"};
    if(('after' in data) && !('block' in data.after))
        return {kind:"error", errMsg: "body.after exists but body.after.block does not"};
    if(('limit' in data) && typeof data.limit !== "number")
        return {kind:"error", errMsg: " body.limit must be a number"};
    if(('limit' in data) && data.limit < apiResponseLimit)
        return {kind:"error", errMsg: `body.limit parameter exceeds api limit: ${apiResponseLimit}`};

    const validatedAddresses = validateAddressesReq(addressRequestLimit, data.addresses);
    switch(validatedAddresses.kind){
        case "ok": 
            return {kind:"ok", value: data};
        case "error":
            return {kind: "error", errMsg: "body.addresses: " +validatedAddresses.errMsg};
        default: return assertNever(validatedAddresses);
    }

};
