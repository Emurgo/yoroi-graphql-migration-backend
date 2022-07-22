export interface Dictionary<T> {
  [key: string]: T;
}

/******************************************************************************
 *  Types related to Account state
 ******************************************************************************/

export interface RewardInfo {
  remainingAmount: string;
  remainingNonSpendableAmount: string;
  rewards: string;
  withdrawals: string;
  poolOperator: null;
  isRewardsOff?: boolean;
}

export type AccountStateResponse = Dictionary<RewardInfo | null>;

/******************************************************************************
 *  Types related to Registration History
 ******************************************************************************/

export interface Pointer {
  slot: number;
  txIndex: number;
  certIndex: number;
  certType: 'StakeRegistration' | 'StakeDeregistration';
}

export type RegHistoryResponse = Dictionary<Pointer[]>;

/******************************************************************************
 *  Types related to Reward History
 ******************************************************************************/

export interface RewardForEpoch {
  epoch: number;
  spendableEpoch: number;
  reward: string;
  poolHash: string;
}

export type RewardHistoryResponse = Dictionary<RewardForEpoch[]>;

/******************************************************************************
 *  Types related to Pool info
 ******************************************************************************/

export interface RemotePool {
  readonly info: any;
  history: PoolHistory[];
}

export interface PoolHistory {
  epoch: number;
  slot: number;
  tx_ordinal: number;
  cert_ordinal: number;
  payload: Certificate | null;
}

export type PoolInfoResponse = Dictionary<RemotePool | null>;

/******************************************************************************
 *  Types related to Delegation history
 ******************************************************************************/

export interface DelegationRangeResponse {
  hash: string;
  epoch: number;
  slot: number;
  tx_ordinal: number;
  cert_ordinal: number;
  payload: Certificate | null;
  info: {
    name: string;
    description: string;
    ticket: string;
    homepage: string;
  };
}

export type DelegationHistoryResponse = DelegationRangeResponse[];

export type Certificate =
  | StakeRegistration
  | StakeDeregistration
  | StakeDelegation
  | PoolRegistration
  | PoolRetirement
  | MoveInstantaneousRewardsCert;

export interface StakeRegistration {
  kind: 'StakeRegistration';
  certIndex: number;
  rewardAddress: string;
}
export interface StakeDeregistration {
  kind: 'StakeDeregistration';
  certIndex: number;
  rewardAddress: string;
}
export interface StakeDelegation {
  kind: 'StakeDelegation';
  certIndex: number;
  rewardAddress: string;
  poolKeyHash: string;
}
export interface PoolRegistration {
  kind: 'PoolRegistration';
  certIndex: number;
  poolParams: PoolParams;
}
export interface PoolRetirement {
  kind: 'PoolRetirement';
  certIndex: number;
  poolKeyHash: string;
  epoch: number;
}
export interface MoveInstantaneousRewardsCert {
  kind: 'MoveInstantaneousRewardsCert';
  certIndex: number;
  pot: MirCertPot;
  rewards: null | Dictionary<string>;
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

export interface PoolRelay {
  ipv4: string;
  ipv6: string;
  dnsName: string;
  dnsSrvName: string;
  port: string;
}

export interface PoolMetadata {
  url: string;
  metadataHash: string;
}

export enum MirCertPot {
  Reserves = 0,
  Treasury = 1,
}

/******************************************************************************
 *  Types related to Best block
 ******************************************************************************/

export interface CardanoFrag {
  epoch: number;
  slot: number;
  hash: string;
  height: number;
}

export type BestBlockResponse = CardanoFrag;

/******************************************************************************
 *  Types related to Tip status
 ******************************************************************************/

export interface TipStatusResponse {
  safeBlock: string | undefined;
  bestBlock: string | undefined;
  reference?: {
    lastFoundSafeBlock: string;
    lastFoundBestBlock: string;
  };
}

/******************************************************************************
 *  Types related to UTXOs
 ******************************************************************************/

interface Asset {
  name: string;
  policy: string;
}

export interface UTXOAtPointResponse {
  utxo_id: string;
  tx_hash: any;
  tx_index: any;
  receiver: any;
  amount: any;
  assets: Asset[];
  block_num: any;
}

export interface UTXODiffSincePointResponse {
  blockHash: string;
  txHash: any;
  itemIndex: number;
  diffItems: {
    type: string;
    id: string;
    amount: number;
    receiver?: string;
    assets?: Asset[];
    block_num?: number;
    tx_hash?: string;
    tx_index?: any;
  };
}

export interface UtxoSumResponse {
  sum: string;
  tokensBalance: TokenBalace[];
}

export interface TokenBalace {
  assetId: string;
  amount: string;
}

/******************************************************************************
 *  Types related to TX History
 ******************************************************************************/

export enum BlockEra {
  Byron = 'byron',
  Shelley = 'shelley',
}

export interface TransOutputFrag {
  address: string;
  amount: string;
  dataHash: null | string;
  assets: null | Asset[];
}

export interface TransInputFrag {
  address: string;
  amount: string;
  id: string;
  index: number;
  txHash: string;
  assets: Asset[];
}

export interface TransactionFragResponse {
  hash: string;
  fee: string;
  valid_contract: boolean;
  script_size: number;
  type: BlockEra;
  metadata: null | string;
  inputs: TransInputFrag[];
  tx_ordinal: number;
  withdrawals: TransOutputFrag[];
  certificates: Certificate[];
  tx_state: string;
  last_update: Date;
  block_num: number;
  block_hash: string;
  time: Date;
  epoch: number;
  slot: number;
  collateral_inputs: TransInputFrag[];
  outputs: TransOutputFrag[];
}

/******************************************************************************
 *  Types related to TXs
 ******************************************************************************/

export interface Input {
  address: string;
  amount: string;
  id: string;
  index: number;
  txHash: string;
  assets: Asset[];
}

export type Output = Pick<Input, 'address' | 'address' | 'assets'> & {
  dataHash: string | null;
};

export interface TXHashResponse {
  inputs: Input[];
  collateralInputs: Input[];
  outputs: Output[];
}

/******************************************************************************
 *  Types related to Messages
 ******************************************************************************/

export interface Message {
  [key: string]: {
    blockNumber: number;
    title: string;
    content: string;
    valid: number | null;
    expire: number | null;
  };
}

export type MessageResponse = Dictionary<Message[] | null>;

/******************************************************************************
 *  Types related to DataPoints
 ******************************************************************************/

export interface Datapoint {
  [address: string]: {
    blockNumber: number;
    blockDistance: number | null; // null if block parameter is not used
    txHash: string;
    txIndex: number;
    payload: any;
  };
}

export type DatapointResponse = Dictionary<Datapoint[]>;

/******************************************************************************
 *  Types related to Tickers
 ******************************************************************************/
export interface Ticker {
  [address: string]: {
    ticker: string;
    latestBlock: number;
  };
}

export type TickerResponse = Dictionary<Ticker[]>;

/******************************************************************************
 *  Types related to Cardano Wallet
 ******************************************************************************/

export interface PoolInfo {
  pool_info: any;
  pool_id: string;
  cost: string;
  margin: string;
  pledge: string;
  non_myopic_member_rewards: number;
  produced_blocks: number;
  relative_stake: string;
}

export type PoolResponse = PoolInfo[];

/******************************************************************************
 *  Types related to MultiAsset
 ******************************************************************************/

export interface MultiAssetSupplyResponse {
  supplies: {
    [key: string]: number;
  };
}

export interface MultiAssetTxMintMetadata {
  key: string;
  metadata: any;
}

export interface MultiAssetMetadataResponse {
  [key: string]: MultiAssetTxMintMetadata[];
}

export interface PolicyIDResponse {
  policyIdResults: { [key: string]: boolean };
  fingerprintResults: { [key: string]: boolean };
}

/******************************************************************************
 *  Types related to Status
 ******************************************************************************/
export interface StatusResponse {
  parallelSync: boolean;
  isServerOk: boolean;
  isMaintenance: boolean;
  serverTime: number;
  isQueueOnline: boolean;
}
