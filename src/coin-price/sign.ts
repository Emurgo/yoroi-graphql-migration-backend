import CardanoWasm from "@emurgo/cardano-serialization-lib-nodejs";
import { CslContext } from "../utils/csl";
import type { Ticker } from "./types";

export function serializeTicker(ticker: Ticker): Buffer {
  return Buffer.from(
    ticker.from +
      ticker.timestamp +
      Object.keys(ticker.prices)
        .sort()
        .map((to) => to + ticker.prices[to])
        .join(""),
    "utf8"
  );
}

export function sign(
  obj: any,
  serializer: (arg0: any) => Buffer,
  privateKey: CardanoWasm.PrivateKey,
  ctx: CslContext
): string {
  return ctx.wrap(privateKey.sign(serializer(obj))).to_hex();
}

export function verify(
  obj: any,
  serializer: (arg0: any) => Buffer,
  signatureHex: string,
  publicKey: CardanoWasm.PublicKey,
  ctx: CslContext
): boolean {
  return publicKey.verify(
    serializer(obj),
    ctx.wrap(CardanoWasm.Ed25519Signature.from_bytes(Buffer.from(signatureHex, "hex")))
  );
}
