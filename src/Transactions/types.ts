
export enum BlockEra { Byron = "byron"
                     , Shelley = "shelley"}

export interface TransactionFrag {
    hash: string;
    fee: string;
    ttl: string;
    blockEra: BlockEra;
    metadata: string;
    block: BlockFrag;
    includedAt: Date;
    inputs: TransInputFrag[];
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
export interface TransInputFrag {
    address: string;
    amount: string;
    id: string;
    index: number;
    txHash: string;
}
export interface TransOutputFrag {
    address: string;
    amount: string;
}

export type Certificate = StakeRegistration | StakeDeregistration | StakeDelegation | PoolRegistration | PoolRetirement | MoveInstantaneousRewardsCert;

export interface StakeRegistration {
  kind: "StakeRegistration";
  stakeCredential: string;
}
export interface StakeDeregistration{
  kind: "StakeDeregistration";
  stakeCredential: string;
}
export interface StakeDelegation{
  kind: "StakeDelegation";
  stakeCredential: string;
  poolKeyHash: string;
}
export interface PoolRegistration{
  kind: "PoolRegistration";
  poolParams: PoolParams;
}
export interface PoolRetirement{
  kind: "PoolRetirement";
  poolKeyHash: string;
  epoch: number;
  
}
export interface MoveInstantaneousRewardsCert{
  kind: "MoveInstantaneousRewardsCert";
  pot: "Reserve" | "Treasury";
  rewards: string[];
}

export interface PoolParams {
    operator: string;
    vrfKeyHash: string
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
    dnsSrvName: string
    port: string;
}
