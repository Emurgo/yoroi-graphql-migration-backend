import {
  Address,
  ByronAddress,
  Ed25519KeyHash,
  RewardAddress,
  StakeCredential,
} from "@emurgo/cardano-serialization-lib-nodejs";
import { decode } from "bech32";
import { Prefixes } from "../../utils/cip5";

const validateRewardAddress = (wasmAddr: Address) => {
  const rewardAddr = RewardAddress.from_address(wasmAddr);
  return rewardAddr != null;
};

export const mapAddresses = (addresses: string[]) => {
  const HEX_REGEXP = RegExp("^[0-9a-fA-F]+$");

  const legacyAddr: string[] = [];
  const bech32: string[] = [];
  const paymentCreds: {original: string, hex: string}[] = [];
  const stakingKeys: {original: string, hex: string}[] = [];
  for (const address of addresses) {
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
            {
              original: address,
              hex: `${Buffer.from(wasmBech32.to_bytes()).toString("hex")}`
            }
          );
          wasmBech32.free();
          break;
        }
        case Prefixes.STAKE_TEST: {
          const wasmBech32 = Address.from_bech32(address);
          stakingKeys.push(
            {
              original: address,
              hex: `${Buffer.from(wasmBech32.to_bytes()).toString("hex")}`
            }
          );
          wasmBech32.free();
          break;
        }
        case Prefixes.PAYMENT_KEY_HASH: {
          const keyHash = Ed25519KeyHash.from_bech32(address);
          const paymentCred = StakeCredential.from_keyhash(keyHash);
          paymentCreds.push({
            original: address,
            hex: Buffer.from(paymentCred.to_bytes()).toString("hex")
          });
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
        const wasmAddr = Address.from_bytes(Buffer.from(address, "hex"));
        if (validateRewardAddress(wasmAddr)) {
          stakingKeys.push({
            original: address,
            hex: address
          });
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
    stakingKeys
  };
};
