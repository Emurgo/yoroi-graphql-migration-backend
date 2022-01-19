import { Dictionary } from "../utils";

export enum BlockEra {
  Byron = "byron",
  Shelley = "shelley",
}

export interface CardanoFrag {
  epoch: number;
  slot: number;
  hash: string;
  height: number;
}

export interface TransactionFrag {
  hash: string;
  fee: string;
  validContract: boolean;
  scriptSize: number;
  ttl: string;
  blockEra: BlockEra;
  metadata: null | string;
  block: BlockFrag;
  includedAt: Date;
  inputs: TransInputFrag[];
  collateralInputs: TransInputFrag[];
  outputs: TransOutputFrag[]; // technically a TransactionOutput fragment
  txIndex: number;
  withdrawals: TransOutputFrag[];
  certificates: Certificate[];
}
export interface BlockFrag {
  number: number;
  hash: string;
  epochNo: number;
  slotNo: number;
}

export interface Asset {
  assetId: string;
  policyId: string;
  name: null | string;
  amount: string;
}

export interface TransInputFrag {
  address: string;
  amount: string;
  id: string;
  index: number;
  txHash: string;
  assets: Asset[];
}
export interface TransOutputFrag {
  address: string;
  amount: string;
  dataHash: null | string;
  assets: null | Asset[];
}

export type Certificate =
  | StakeRegistration
  | StakeDeregistration
  | StakeDelegation
  | PoolRegistration
  | PoolRetirement
  | MoveInstantaneousRewardsCert;

export interface StakeRegistration {
  kind: "StakeRegistration";
  certIndex: number;
  rewardAddress: string;
}
export interface StakeDeregistration {
  kind: "StakeDeregistration";
  certIndex: number;
  rewardAddress: string;
}
export interface StakeDelegation {
  kind: "StakeDelegation";
  certIndex: number;
  rewardAddress: string;
  poolKeyHash: string;
}
export interface PoolRegistration {
  kind: "PoolRegistration";
  certIndex: number;
  poolParams: PoolParams;
}
export interface PoolRetirement {
  kind: "PoolRetirement";
  certIndex: number;
  poolKeyHash: string;
  epoch: number;
}
export interface MoveInstantaneousRewardsCert {
  kind: "MoveInstantaneousRewardsCert";
  certIndex: number;
  pot: MirCertPot;
  rewards: null | Dictionary<string>;
}

export enum MirCertPot {
  Reserves = 0,
  Treasury = 1,
}

export interface PoolParams {
  operator: string;
  vrfKeyHash: string;
  pledge: string;
  cost: string;
  margin: number;
  rewardAccount: string;
  poolOwners: string[];
  relays: PoolRelay[];
  poolMetadata: null | PoolMetadata;
}

export interface PoolMetadata {
  url: string;
  metadataHash: string;
}

export interface PoolRelay {
  ipv4: string;
  ipv6: string;
  dnsName: string;
  dnsSrvName: string;
  port: string;
}
export const rowToCertificate = (row: any): Certificate | null => {
  switch (row.jsType) {
    case "StakeRegistration":
      return {
        kind: row.jsType,
        certIndex: row.certIndex,
        rewardAddress: row.stakeCred,
      };
    case "StakeDeregistration":
      return {
        kind: row.jsType,
        certIndex: row.certIndex,
        rewardAddress: row.stakeCred,
      };
    case "StakeDelegation":
      return {
        kind: row.jsType,
        certIndex: row.certIndex,
        poolKeyHash: row.poolHashKey,
        rewardAddress: row.stakeCred,
      };
    case "PoolRegistration": {
      const poolRelays = row.poolParamsRelays
        ? row.poolParamsRelays.map((obj: any) => ({
            ipv4: obj.ipv4,
            ipv6: obj.ipv6,
            dnsName: obj.dnsName,
            dnsSrvName: obj.dnsSrvName,
            port: obj.port ? obj.port.toString() : null,
          }))
        : [];

      const params = {
        operator: row.poolParamsOperator,
        vrfKeyHash: row.poolParamsVrfKeyHash,
        pledge: row.poolParamsPledge.toString(),
        cost: row.poolParamsCost.toString(),
        margin: row.poolParamsMargin,
        rewardAccount: row.poolParamsRewardAccount,
        // The owners property of the pool parameter is a set of stake key hashes
        // of the owners in CDDL and cardano-serialization-lib. But in the DB they
        // are a set of stake addresses which are "a single header byte identifying
        // their type and the network, followed by 28 bytes of payload identifying
        // either a stake key hash or a script hash" (CIP19).
        // So we remove the header byte.
        poolOwners: row.poolParamsOwners.map((stakeAddr: string) =>
          stakeAddr.slice(2)
        ),
        relays: poolRelays,
        poolMetadata:
          row.poolParamsMetaDataUrl === null
            ? null
            : {
                url: row.poolParamsMetaDataUrl,
                metadataHash: row.poolParamsMetaDataHash,
              },
      };
      return { kind: row.jsType, certIndex: row.certIndex, poolParams: params };
    }
    case "PoolRetirement":
      return {
        kind: row.jsType,
        certIndex: row.certIndex,
        poolKeyHash: row.poolHashKey,
        epoch: row.epoch,
      };
    case "MoveInstantaneousRewardsCert": {
      const rewards: Dictionary<string> = {};
      let potType = MirCertPot.Reserves;
      if (row.mirPot === "Reserves") potType = MirCertPot.Reserves;
      else if (row.mirPot === "Treasury") potType = MirCertPot.Treasury;
      else
        throw new Error(
          "rowtoCert: invalid pot type.  Someone must have changes certificates.ts and not let this method know about it."
        );

      for (const o of row.rewards) rewards[o.f1] = o.f2.toString();
      return {
        kind: row.jsType,
        certIndex: row.certIndex,
        pot: potType,
        rewards: row.rewards === null ? {} : rewards,
      };
    }
    default:
      console.log(`Certificate from DB doesn't match any known type: ${row}`); // the app only logs errors.
      return null;
  }
};

export interface UtxoSumResponse {
  sum: string;
  tokensBalance: TokenBalace[];
}

export interface TokenBalace {
  assetId: string;
  amount: string;
}
