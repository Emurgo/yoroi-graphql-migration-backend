import { Router, Request, Response, NextFunction } from "express";
import {
  Address,
  ByronAddress,
  BaseAddress,
  PointerAddress,
  EnterpriseAddress,
  RewardAddress,
} from "@emurgo/cardano-serialization-lib-nodejs";
import { decode, fromWords } from "bech32";
import { Prefixes } from "./cip5";
import {Asset} from "../Transactions/types";

export const contentTypeHeaders = { headers: {"Content-Type": "application/json"}};

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
    // uncomment this line if you want to test locally
    // (router as any)[method](`/api${path}`, handler);
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

export const extractAssets = (obj: null | any): Asset[] => {
  if (obj == null) return [] as Asset[];
  return obj.map((token: any) => {
    const policyId: string = token.f1 == null ? "" : token.f1
    const name: string = token.f2 == null ? "" : token.f2
    return {
      assetId: policyId + "." + name, // policyId.nameId
      policyId,
      name,
      amount: token.f3.toString()
    }
  })
}

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
    
    try {
      const bech32Info = decode(address, 1000);
      switch (bech32Info.prefix) {
        case Prefixes.ADDR: {
          bech32.push(address);
          break;
        }
        case Prefixes.ADDR_TEST: {
          bech32.push(address);
          break;
        }
        case Prefixes.STAKE: {
          const wasmBech32 = Address.from_bech32(address);
          stakingKeys.push(
            `\\x${Buffer.from(wasmBech32.to_bytes()).toString("hex")}`
          );
          wasmBech32.free();
          break;
        }
        case Prefixes.STAKE_TEST: {
          const wasmBech32 = Address.from_bech32(address);
          stakingKeys.push(
            `\\x${Buffer.from(wasmBech32.to_bytes()).toString("hex")}`
          );
          wasmBech32.free();
          break;
        }
        case Prefixes.PAYMENT_KEY_HASH: {
          const payload = fromWords(bech32Info.words);
          paymentCreds.push(
            `\\x${Buffer.from(payload).toString("hex")}`
          );
          break;
        }
        default: continue;
      }
      continue;
    } catch (_e) {
      // silently discard any non-valid Cardano addresses
    }
    try {
      if (HEX_REGEXP.test(address)) {
        const wasmAddr = Address.from_bytes(
          Buffer.from(address, "hex")
        );
        if (validateRewardAddress(wasmAddr)) {
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
