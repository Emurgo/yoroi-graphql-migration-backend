import { expect } from "chai";
import crypto from "crypto";
import {
  PrivateKey,
  PublicKey,
} from "@emurgo/cardano-serialization-lib-nodejs";
import { serializeTicker, sign, verify } from "./sign";
import { createCslContext } from "../utils/csl";

const TICKER = {
  from: "ADA",
  timestamp: 1550000000000,
  prices: { USD: 0.5, CNY: 3, JPY: 10, KRW: 1 },
};

const PRIVATE_KEY =
  "68bb712c0c65f6f3a97e77edf0c6a9b8d39b213cd8764cf8dd32ad02dc86bf535e9b45f79a2ff4dbb5672b3df2225a768b713dc5d29bc9476b026fb235d38fd3";
const PUBLIC_KEY =
  "4711516aac6adccd06054939c45e2487df239ba86cc277ae56aaac0a83f0bf96";

it("sign and verify a ticker", () => {
  const ctx = createCslContext();

  const signature = sign(
    TICKER,
    serializeTicker,
    ctx.wrap(PrivateKey.from_extended_bytes(Buffer.from(PRIVATE_KEY, "hex"))),
    ctx
  );

  expect(
    verify(
      TICKER,
      serializeTicker,
      signature,
      ctx.wrap(PublicKey.from_bytes(Buffer.from(PUBLIC_KEY, "hex"))),
      ctx
    )
  ).to.equal(true);

  const invalidSig = crypto.randomBytes(64).toString("hex");
  expect(
    verify(
      TICKER,
      serializeTicker,
      invalidSig,
      ctx.wrap(PublicKey.from_bytes(Buffer.from(PUBLIC_KEY, "hex"))),
      ctx
    )
  ).to.equal(false);

  ctx.freeAll();
});
