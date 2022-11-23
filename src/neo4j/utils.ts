import {
  Address,
  ByronAddress,
  Ed25519KeyHash,
  RewardAddress,
  StakeCredential
} from "@emurgo/cardano-serialization-lib-nodejs";
import { HEX_REGEXP, validateRewardAddress } from "../utils";

export const getAddressesByType = (addresses: string[]) => {
  const bech32OrBase58Addresses = [] as string[];
  const paymentCreds = [] as string[];
  const addrKeyHashes = [] as string[];
  const rewardAddresses = [] as string[];

  for (const address of addresses) {
    if (ByronAddress.is_valid(address)) {
      bech32OrBase58Addresses.push(address);
      bech32OrBase58Addresses.push(ByronAddress.from_base58(address).to_address().to_bech32());
      continue;
    }

    if (address.startsWith("addr_vkh")) {
      const keyHash = Ed25519KeyHash.from_bech32(address);
      const cred = StakeCredential.from_keyhash(keyHash);
      paymentCreds.push(Buffer.from(cred.to_bytes()).toString("hex"));
      continue;
    }

    if (address.startsWith("addr") || address.startsWith("addr_test")) {
      bech32OrBase58Addresses.push(address);
      continue;
    }

    if (address.startsWith("stake") || address.startsWith("stake_test")) {
      const rewardAddress = RewardAddress.from_address(
        Address.from_bech32(address)
      );
      if (rewardAddress) {
        rewardAddresses.push(Buffer.from(rewardAddress.to_address().to_bytes()).toString("hex"));
        const cred = rewardAddress.payment_cred();
        const keyHash = cred.to_keyhash();
        if (keyHash) {
          addrKeyHashes.push(Buffer.from(keyHash.to_bytes()).toString("hex"));
        }
      }
      continue;
    }

    try {
      if (HEX_REGEXP.test(address)) {
        const wasmAddr = Address.from_bytes(Buffer.from(address, "hex"));
        if (validateRewardAddress(wasmAddr)) {
          rewardAddresses.push(address);
          const rewardAddress = RewardAddress.from_address(
            wasmAddr
          );
          if (rewardAddress) {
            const cred = rewardAddress.payment_cred();
            const keyHash = cred.to_keyhash();
            if (keyHash) {
              addrKeyHashes.push(Buffer.from(keyHash.to_bytes()).toString("hex"));
            }
          }
        } else if (/^[0-8]/.test(address)) {
          bech32OrBase58Addresses.push(wasmAddr.to_bech32());
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
    rewardAddresses
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
