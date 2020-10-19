import config from "config";
import { Router, Request, Response, NextFunction } from "express";
import {
  Address,
  ByronAddress,
  BaseAddress,
  PointerAddress,
  EnterpriseAddress,
  RewardAddress,
} from "@emurgo/cardano-serialization-lib-nodejs";
import { decode } from "bech32";

export const contentTypeHeaders = { headers: {"Content-Type": "application/json"}};
export const graphqlEndpoint:string = config.get("server.graphqlEndpoint");

export const errMsgs = { noValue: "no value" };

type Wrapper = ((router: Router) => void);

export const applyMiddleware = (
  middlewareWrappers: Wrapper[],
  router: Router
) => {
  for (const wrapper of middlewareWrappers) {
    wrapper(router);
  }
};

export const HEX_REGEXP = RegExp("^[0-9a-fA-F]+$"); 

export interface Dictionary<T> {
 [key: string]: T;
}

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

export interface Route {
  path: string;
  method: string;
  handler: Handler | Handler[];
}

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
  if(!("addresses" in data))
    return {kind:"error", errMsg: "body.addresses does not exist."};
  if(!("untilBlock" in data))
    return {kind:"error", errMsg: "body.untilBlock does not exist."};
  if(("after" in data) && !("tx" in data.after))
    return {kind:"error", errMsg: "body.after exists but body.after.tx does not"};
  if(("after" in data) && !("block" in data.after))
    return {kind:"error", errMsg: "body.after exists but body.after.block does not"};
  if(("limit" in data) && typeof data.limit !== "number")
    return {kind:"error", errMsg: " body.limit must be a number"};
  if(("limit" in data) && data.limit > apiResponseLimit)
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

export function getSpendingKeyHash(
  wasmAddr: Address,
): (undefined | string) {
  const getResult = (bytes: Uint8Array | undefined) => {
    if (bytes == null) return undefined;
    return Buffer.from(bytes).toString("hex");
  };

  {
    const baseAddr = BaseAddress.from_address(wasmAddr);
    if (baseAddr) {
      const result = getResult(baseAddr.payment_cred().to_keyhash()?.to_bytes());
      baseAddr.free();
      return result;
    }
  }
  {
    const ptrAddr = PointerAddress.from_address(wasmAddr);
    if (ptrAddr) {
      const result = getResult(ptrAddr.payment_cred().to_keyhash()?.to_bytes());
      ptrAddr.free();
      return result;
    }
  }
  {
    const enterpriseAddr = EnterpriseAddress.from_address(wasmAddr);
    if (enterpriseAddr) {
      const result = getResult(enterpriseAddr.payment_cred().to_keyhash()?.to_bytes());
      enterpriseAddr.free();
      return result;
    }
  }
}

export function validateRewardAddress(
  wasmAddr: Address,
): boolean {
  const rewardAddr = RewardAddress.from_address(wasmAddr);
  return rewardAddr != null;
}

export function getAddressesByType(addresses: string[]): {
  /**
   * note: we keep track of explicit bech32 addresses
   * since it's possible somebody wants the tx history for a specific address
   * and not the tx history for the payment key of the address
   */
  legacyAddr: string[],
  bech32: string[],
  paymentCreds: string[],
  stakingKeys: string[],
} {
  const legacyAddr = [];
  const bech32 = [];
  const paymentCreds = [];
  const stakingKeys = [];
  for (const address of addresses) {
    // 1) Check if it's a Byron-era address
    if (ByronAddress.is_valid(address)) {
      legacyAddr.push(address);
      continue;
    }
    // 2) check if it's a valid bech32 address
    try {
      decode(address, 1000); // check it's a valid bech32 address
      const wasmBech32 = Address.from_bech32(address);
      bech32.push(address);
      wasmBech32.free();
      continue;
    } catch (_e) {
      // silently discard any non-valid Cardano addresses
    }
    try {
      if (HEX_REGEXP.test(address)) {
        const wasmAddr = Address.from_bytes(
          Buffer.from(address, "hex")
        );
        const spendingKeyHash = getSpendingKeyHash(wasmAddr);
        if (spendingKeyHash != null) {
          paymentCreds.push(`\\x${spendingKeyHash}`);
        } else if (validateRewardAddress(wasmAddr)) {
          stakingKeys.push(`\\x${address}`);
        }
        wasmAddr.free();
        continue;
      }
    } catch (_e) {
      // silently discard any non-valid Cardano addresses
    }
  }

  return {
    legacyAddr,
    bech32,
    paymentCreds,
    stakingKeys,
  };
}
