
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
  certIndex: number;
  stakeCredential: string;
}
export interface StakeDeregistration{
  kind: "StakeDeregistration";
  certIndex: number;
  stakeCredential: string;
}
export interface StakeDelegation{
  kind: "StakeDelegation";
  certIndex: number;
  stakeCredential: string;
  poolKeyHash: string;
}
export interface PoolRegistration{
  kind: "PoolRegistration";
  certIndex: number;
  poolParams: PoolParams;
}
export interface PoolRetirement{
  kind: "PoolRetirement";
  certIndex: number;
  poolKeyHash: string;
  epoch: number;
  
}
export interface MoveInstantaneousRewardsCert{
  kind: "MoveInstantaneousRewardsCert";
  certIndex: number;
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
export const rowToCertificate = (row:any):Certificate|null => {
  switch(row.jsType){
  case "StakeRegistration":
    return { kind: row.jsType
      , certIndex: row.certIndex
      , stakeCredential: row.stakeCred };
  case "StakeDeregistration":
    return { kind: row.jsType
      , certIndex: row.certIndex
      , stakeCredential: row.stakeCred };
  case "StakeDelegation":
    return { kind: row.jsType
      , certIndex: row.certIndex
      , poolKeyHash: row.poolHashKey
      , stakeCredential: row.stakeCred };
  case "PoolRegistration": {
    const poolRelays = row.poolParamsRelays 
      ? row.poolParamsRelays.map((obj:any) => ({
        ipv4: obj.ipv4
        , ipv6: obj.ipv6
        , dnsName: obj.dnsName
        , dnsSrvName: obj.dnsSrvName
        , port: obj.port.toString()
      }))
      : [];
                                                     
    const params = { 
      operator: row.poolParamsOperator
      , vrfKeyHash: row.poolParamsVrfKeyHash
      , pledge: row.poolParamsPledge.toString()
      , cost: row.poolParamsCost.toString()
      , margin: row.poolParamsMargin
      , rewardAccount: row.poolParamsRewardAccount
      , poolOwners: row.poolParamsOwners
      , relays: poolRelays
      , poolMetadata: row.poolParamsMetaDataUrl === null 
        ? null
        : { url: row.poolParamsMetaDataUrl
          , metadataHash: row.poolParamsMetaDataHash }
    };
    return { kind: row.jsType
      , certIndex: row.certIndex
      , poolParams: params};
  }
  case "PoolRetirement":
    return { kind: row.jsType
      , certIndex: row.certIndex
      , poolKeyHash: row.poolHashKey
      , epoch: row.epoch };
  case "MoveInstantaneousRewardsCert":
    return { kind: row.jsType
      , certIndex: row.certIndex
      , pot: row.mirPot
      , rewards: row.rewards === null
        ? []
        : row.rewards.map( (o:any)=> o.f1) };
  default:
    console.log(`Certificate from DB doesn't match any known type: ${row}`); // the app only logs errors.
    return null;
  }
};
