import {
  Address,
  ByronAddress,
  Ed25519KeyHash,
  RewardAddress,
  StakeCredential
} from "@emurgo/cardano-serialization-lib-nodejs";
import { HEX_REGEXP, validateRewardAddress } from "../utils";
import config from "config";

export const getAddressesByType = (addresses: string[]) => {
  const map: { [key: string]: string } = {};

  const bech32OrBase58Addresses = [] as string[];
  const paymentCreds = [] as string[];
  const addrKeyHashes = [] as string[];
  const rewardAddresses = [] as string[];

  for (const address of addresses) {
    if (ByronAddress.is_valid(address)) {
      bech32OrBase58Addresses.push(address);
      map[address] = address;

      const byronAddress = ByronAddress.from_base58(address);
      const actualAddress = byronAddress.to_address();

      const byronAsBech32 = actualAddress.to_bech32(getBech32Prefix());

      bech32OrBase58Addresses.push(byronAsBech32);
      map[byronAsBech32] = address;

      actualAddress.free();
      byronAddress.free();

      continue;
    }

    if (address.startsWith("addr_vkh")) {
      const keyHash = Ed25519KeyHash.from_bech32(address);
      const cred = StakeCredential.from_keyhash(keyHash);
      const hex = Buffer.from(cred.to_bytes()).toString("hex");
      
      paymentCreds.push(hex);
      map[hex] = address;

      cred.free();
      keyHash.free();

      continue;
    }

    if (address.startsWith("addr") || address.startsWith("addr_test")) {

      bech32OrBase58Addresses.push(address);
      map[address] = address;

      continue;
    }

    if (address.startsWith("stake") || address.startsWith("stake_test")) {
      const actualAddress = Address.from_bech32(address);
      const rewardAddress = RewardAddress.from_address(
        actualAddress
      );
      if (rewardAddress) {
        const rewardAddressToAddress = rewardAddress.to_address();
        rewardAddresses.push(Buffer.from(rewardAddressToAddress.to_bytes()).toString("hex"));
        const cred = rewardAddress.payment_cred();
        const keyHash = cred.to_keyhash();
        if (keyHash) {
          const hex = Buffer.from(keyHash.to_bytes()).toString("hex");
          
          addrKeyHashes.push(hex);
          map[hex] = address;
          keyHash.free();
        }
        cred.free();
        rewardAddressToAddress.free();
        rewardAddress.free();
      }
      actualAddress.free();
      continue;
    }

    try {
      if (HEX_REGEXP.test(address)) {
        const wasmAddr = Address.from_bytes(Buffer.from(address, "hex"));
        if (validateRewardAddress(wasmAddr)) {
          rewardAddresses.push(address);
          map[address] = address;

          const rewardAddress = RewardAddress.from_address(
            wasmAddr
          );
          if (rewardAddress) {
            const cred = rewardAddress.payment_cred();
            const keyHash = cred.to_keyhash();
            if (keyHash) {
              const hex = Buffer.from(keyHash.to_bytes()).toString("hex");
              addrKeyHashes.push(hex);
              map[hex] = address;
              keyHash.free();
            }
            cred.free();
            rewardAddress.free();
          }
        } else if (/^[0-8]/.test(address)) {
          const asBech32 = wasmAddr.to_bech32(getBech32Prefix());
          bech32OrBase58Addresses.push(asBech32);
          map[asBech32] = address;
        }
        wasmAddr.free();
        continue;
      }
    } catch { /* */ }
  }

  return {
    bech32OrBase58Addresses,
    paymentCreds,
    addrKeyHashes,
    rewardAddresses,
    addressFormatMap: map
  };
};

export const mapNeo4jAssets = (assets: string | [] | null | undefined) => {
  return assets && typeof assets === "string"
    ? JSON.parse(assets).map((a: any) => ({
      assetId: `${a.policy}.${a.asset}`,
      policyId: a.policy,
      name: a.asset,
      amount: a.amount.toString()
    }))
    : [];
};

export const getBech32Prefix = () => {
  if (config.get("network") === "mainnet") {
    return "addr";
  }

  return "addr_test";
};
