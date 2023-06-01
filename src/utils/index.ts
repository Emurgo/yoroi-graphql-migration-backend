import { blake2b } from "hash-wasm";
import { NextFunction, Request, Response, Router } from "express";
import * as Cardano from "@emurgo/cardano-serialization-lib-nodejs";
import { bech32 } from "bech32";
import { Prefixes } from "./cip5";
import { Asset } from "../Transactions/types";
import { ClientBase, Pool, QueryConfig, QueryResult, QueryResultRow } from "pg";
import { createCslContext } from "./csl";

const { decode, fromWords } = bech32;

export const contentTypeHeaders = {
  headers: { "Content-Type": "application/json" },
};

export const errMsgs = { noValue: "no value" };

type Wrapper = (router: Router) => void;

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
) => Promise<void> | void | Promise<Response>;

export interface Route {
  path: string;
  method: string;
  handler: Handler | Handler[] | Response;
  interceptor?: (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * NOTE: this function will always ROLLBACK and never commit,
 * the only reason is to assure atomic concurrent reading within a transaction.
 */
async function pgSnapshotRead<T>(
  pool: Pool,
  cb: (client: ClientBase) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    return await cb(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

export type PoolOrClient = {
  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: I
  ): Promise<QueryResult<R>>;
};

export const pgSnapshotReadWrapper =
  (handlerFactory: (pool: PoolOrClient) => Handler) =>
  (pool: Pool): Handler =>
  async (req: Request, res: Response, next: NextFunction) => {
    pgSnapshotRead(pool, async (client) =>
      handlerFactory(client)(req, res, next)
    );
  };

export const applyRoutes = (routes: Route[], router: Router) => {
  for (const route of routes) {
    const { method, path, handler, interceptor } = route;
    if (interceptor) {
      (router as any)[method](path, interceptor);
      (router as any)[method](path, handler);
      // uncomment these lines if you want to test locally
      (router as any)[method](`/api${path}`, interceptor);
      (router as any)[method](`/api${path}`, handler);
    } else {
      (router as any)[method](path, handler);
      // uncomment this line if you want to test locally
      (router as any)[method](`/api${path}`, handler);
    }
  }
};

export interface UtilOK<T> {
  kind: "ok";
  value: T;
}
export interface UtilErr {
  kind: "error";
  errMsg: string;
}
export type UtilEither<T> = UtilOK<T> | UtilErr;

export function assertNever(x: never): never {
  throw new Error("this should never happen" + x);
}

/**
 * This method validates addresses request body
 * @param {Array[String]} addresses
 */
export const validateAddressesReq = (
  addressRequestLimit: number,
  addresses: string[]
): UtilEither<string[]> => {
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

export const validateHistoryReq = (
  addressRequestLimit: number,
  apiResponseLimit: number,
  data: any
): UtilEither<HistoryRequest> => {
  if (!("addresses" in data))
    return { kind: "error", errMsg: "body.addresses does not exist." };
  if (!("untilBlock" in data))
    return { kind: "error", errMsg: "body.untilBlock does not exist." };
  if ("after" in data && !("tx" in data.after))
    return {
      kind: "error",
      errMsg: "body.after exists but body.after.tx does not",
    };
  if ("after" in data && !("block" in data.after))
    return {
      kind: "error",
      errMsg: "body.after exists but body.after.block does not",
    };
  if ("limit" in data && typeof data.limit !== "number")
    return { kind: "error", errMsg: " body.limit must be a number" };
  if ("limit" in data && data.limit > apiResponseLimit)
    return {
      kind: "error",
      errMsg: `body.limit parameter exceeds api limit: ${apiResponseLimit}`,
    };

  const validatedAddresses = validateAddressesReq(
    addressRequestLimit,
    data.addresses
  );
  switch (validatedAddresses.kind) {
    case "ok":
      return { kind: "ok", value: data };
    case "error":
      return {
        kind: "error",
        errMsg: "body.addresses: " + validatedAddresses.errMsg,
      };
    default:
      return assertNever(validatedAddresses);
  }
};

export const extractAssets = (obj: null | any): Asset[] => {
  if (obj == null) return [] as Asset[];
  return obj.map((token: any) => {
    const policyId: string = token.f1 == null ? "" : token.f1;
    const name: string = token.f2 == null ? "" : token.f2;
    return {
      assetId: policyId + "." + name, // policyId.nameId
      policyId,
      name,
      amount: token.f3.toString(),
    };
  });
};

export function getSpendingKeyHash(wasmAddr: Cardano.Address): undefined | string {
  const ctx = createCslContext();

  try {
    const getResult = (bytes: Uint8Array | undefined) => {
      if (bytes == null) return undefined;
      return Buffer.from(bytes).toString("hex");
    };
  
    {
      const baseAddr = ctx.wrapU(Cardano.BaseAddress.from_address(wasmAddr));
      if (baseAddr) {
        const result = getResult(
          ctx.wrapU(ctx.wrap(baseAddr.payment_cred()).to_keyhash())?.to_bytes()
        );
        return result;
      }
    }
    {
      const ptrAddr = ctx.wrapU(Cardano.PointerAddress.from_address(wasmAddr));
      if (ptrAddr) {
        const result = getResult(
          ctx.wrapU(ctx.wrap(ptrAddr.payment_cred()).to_keyhash())?.to_bytes()
        );
        return result;
      }
    }
    {
      const enterpriseAddr = ctx.wrapU(Cardano.EnterpriseAddress.from_address(wasmAddr));
      if (enterpriseAddr) {
        const result = getResult(
          ctx.wrapU(ctx.wrap(enterpriseAddr.payment_cred()).to_keyhash())?.to_bytes()
        );
        return result;
      }
    }
  } finally {
    ctx.freeAll();
  }
}

export function validateRewardAddress(wasmAddr: Cardano.Address): boolean {
  const ctx = createCslContext();
  try {
    const rewardAddr = ctx.wrapU(Cardano.RewardAddress.from_address(wasmAddr));
    return rewardAddr != null;
  } finally {
    ctx.freeAll();
  }
}

export function getAddressesByType(addresses: string[]): {
  /**
   * note: we keep track of explicit bech32 addresses
   * since it's possible somebody wants the tx history for a specific address
   * and not the tx history for the payment key of the address
   */
  legacyAddr: string[];
  bech32: string[];
  paymentCreds: string[];
  stakingKeys: string[];
} {
  const ctx = createCslContext();

  try {
    const legacyAddr = [];
    const bech32 = [];
    const paymentCreds = [];
    const stakingKeys = [];
    for (const address of addresses) {
      // 1) Check if it's a Byron-era address
      if (Cardano.ByronAddress.is_valid(address)) {
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
            const wasmBech32 = ctx.wrap(Cardano.Address.from_bech32(address));
            stakingKeys.push(
              `\\x${Buffer.from(wasmBech32.to_bytes()).toString("hex")}`
            );
            break;
          }
          case Prefixes.STAKE_TEST: {
            const wasmBech32 = ctx.wrap(Cardano.Address.from_bech32(address));
            stakingKeys.push(
              `\\x${Buffer.from(wasmBech32.to_bytes()).toString("hex")}`
            );
            break;
          }
          case Prefixes.PAYMENT_KEY_HASH: {
            const payload = fromWords(bech32Info.words);
            paymentCreds.push(`\\x${Buffer.from(payload).toString("hex")}`);
            break;
          }
          default:
            continue;
        }
        continue;
      } catch (_e) {
        // silently discard any non-valid Cardano addresses
      }
      try {
        if (HEX_REGEXP.test(address)) {
          const wasmAddr = ctx.wrap(Cardano.Address.from_bytes(Buffer.from(address, "hex")));
          if (validateRewardAddress(wasmAddr)) {
            stakingKeys.push(`\\x${address}`);
          }
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
  } finally {
    ctx.freeAll();
  }
}

export async function calculateTxId(signedTx: string): Promise<string> {
  const ctx = createCslContext();

  try {
    const txBuffer = Buffer.from(signedTx, "base64");
    const tx = ctx.wrap(Cardano.Transaction.from_bytes(txBuffer));
    const txBody = ctx.wrap(tx.body());

    const blake2bTxHash = await blake2b(txBody.to_bytes(), 256);
    return blake2bTxHash;
  } finally {
    ctx.freeAll();
  }
}
