export const MAINNET_URL = "https://backend.yoroiwallet.com/api/";
export const TESTNET_URL = "https://testnet-backend.yoroiwallet.com/api/";

export enum Network {
  Mainnet,
  Testnet,
}

export const createBackend = (networkOrUrl: Network | string) => {
  if (typeof networkOrUrl === "string") {
    return new Backend(networkOrUrl);
  }

  switch (networkOrUrl) {
    case Network.Mainnet:
      return new Backend("https://api.yoroi.io");
    case Network.Testnet:
      return new Backend("https://api.yoroi.io/testnet");
    default:
      throw new Error(`Unknown network: ${networkOrUrl}`);
  }
};

export class Backend {
  constructor(
    public readonly url: string,
    public readonly version: string = "v2.1"
  ) {}

  private getVersionedUrl(path: string): string {
    return `${this.url}/${this.version && `${this.version}/`}${path}`;
  }

  private getRequestBody(
    body: { [key: string]: any }
  ): { method: string; body: string; headers: { [key: string]: string } } {
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    };
  }

  public async getAccountState(addresses: string[]): Promise<AccountStateResponse> {
    const response = await fetch(this.getVersionedUrl("account/state"), this.getRequestBody({ addresses }));
    return await response.json();
  }

  public async getRegistrationHistory(addresses: string[]): Promise<RegHistoryResponse> {
    const response = await fetch(this.getVersionedUrl("account/registrationHistory"), this.getRequestBody({ addresses }));
    return await response.json();
  }

  public async getRewardHistory(addresses: string[]): Promise<RewardHistoryResponse> {
    const response = await fetch(this.getVersionedUrl("account/rewardHistory"), this.getRequestBody({ addresses }));
    return await response.json();
  }

  public async getPoolInfo(poolIds: string[]): Promise<PoolInfoResponse> {
    const response = await fetch(this.getVersionedUrl("pool/info"), this.getRequestBody({ poolIds }));
    return await response.json();
  }

  public async getDelegationHistory(poolRanges: PoolDelegationRange[]): Promise<DelegationHistoryResponse> {
    const response = await fetch(this.getVersionedUrl("pool/delegationHistory"), this.getRequestBody({ poolRanges }));
    return await response.json();
  }

  public async getBestBlock(): Promise<BestBlockResponse> {
    const response = await fetch(this.getVersionedUrl("bestblock"));
    return await response.json();
  }

  public async getTipStatus(): Promise<TipStatusResponse> {
    const response = await fetch(this.getVersionedUrl("tipStatus"));
    return await response.json();
  }

  public async postTipStatus(data: TipStatusRequest): Promise<TipStatusResponse> {
    const response = await fetch(this.getVersionedUrl("tipStatus"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async utxoAtPoint(data: UTXOAtPointRequest): Promise<UTXOAtPointResponse> {
    const response = await fetch(this.getVersionedUrl("txs/utxoAtPoint"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async utxoDiffSincePoint(data: UTXODiffSincePointRequest): Promise<UTXODiffSincePointResponse> {
    const response = await fetch(this.getVersionedUrl("txs/utxoDiffSincePoint"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async filtersUsed(addresses: string[]): Promise<string[]> {
    const response = await fetch(this.getVersionedUrl("txs/utxoDiffSincePoint"), this.getRequestBody({ addresses }));
    return await response.json();
  }

  public async utxoForAddresses(addresses: string[]): Promise<UTXOAtPointResponse> {
    const response = await fetch(this.getVersionedUrl("txs/utxoForAddresses"), this.getRequestBody({ addresses }));
    return await response.json();
  }

  public async utxoSumForAddresses(addresses: string[]): Promise<UtxoSumResponse> {
    const response = await fetch(this.getVersionedUrl("txs/utxoSumForAddresses"), this.getRequestBody({ addresses }));
    return await response.json();
  }

  public async txsHistory(data: TxsHistoryRequest): Promise<TransactionFragResponse[]> {
    const response = await fetch(this.getVersionedUrl("txs/history"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async getTxIO(tx_hash: string): Promise<TXHashResponse> {
    const response = await fetch(this.getVersionedUrl(`txs/io/${tx_hash}`));
    return await response.json();
  }

  public async getTxOutput(tx_hash: string, index: number): Promise<TXOutputResponse> {
    const response = await fetch(this.getVersionedUrl(`txs/io/${tx_hash}/o/${index}`));
    return await response.json();
  }

  public async getTransactions(data: GetTransactionsRequest): Promise<GetTransactionsObjectResponse> {
    const response = await fetch(this.getVersionedUrl("txs/get"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async signedTxs(data: SignedTxsRequest): Promise<void> {
    const response = await fetch(this.getVersionedUrl("txs/signed"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async getMessageBoard(data: GetMessageBoardRequest): Promise<MessageResponse> {
    const response = await fetch(this.getVersionedUrl("messages/getMessageBoard"), this.getRequestBody({ data }));
    return await response.json();
  }
  public async getMessageDirect(data: GetMessageDirectRequest): Promise<MessageResponse> {
    const response = await fetch(this.getVersionedUrl("messages/getMessageDirect"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async getDatapoints(data: GetOracleDataPointRequest): Promise<DatapointResponse> {
    const response = await fetch(this.getVersionedUrl("oracles/getDatapoints"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async getTickers(addresses: string[]): Promise<TickerResponse> {
    const response = await fetch(this.getVersionedUrl("oracles/getTickers"), this.getRequestBody({ addresses }));
    return await response.json();
  }

  public async getCardanoWallet(data: CardanoWalletRequest): Promise<PoolInfo[]> {
    const response = await fetch(this.getVersionedUrl("pool/cardanoWallet"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async multiAssetSupply(assets: Asset[]): Promise<MultiAssetSupplyResponse> {
    const response = await fetch(this.getVersionedUrl("multiAsset/supply"), this.getRequestBody({ assets }));
    return await response.json();
  }

  public async multiAssetMetadata(assets: Asset[]): Promise<MultiAssetMetadataResponse> {
    const response = await fetch(this.getVersionedUrl("multiAsset/metadata"), this.getRequestBody({ assets }));
    return await response.json();
  }

  public async getAssetMintTxs(fingerprint: string): Promise<GetAssetMinTxsResponse> {
    const response = await fetch(this.getVersionedUrl(`asset/${fingerprint}/mintTxs`));
    return await response.json();
  }

  public async validateNFT(fingerprint: string, envName: string): Promise<MultiAssetMetadataResponse> {
    const response = await fetch(this.getVersionedUrl(`multiAsset/validateNFT/${fingerprint}`), this.getRequestBody({ envName }));
    return await response.json();
  }

  public async txStatus(data: TxStatusRequest): Promise<TxStatusResponse> {
    const response = await fetch(this.getVersionedUrl("tx/status"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async policyIds(data: PolicyIDRequest): Promise<PolicyIDResponse> {
    const response = await fetch(this.getVersionedUrl("multiAsset/policyIdExists"), this.getRequestBody({ data }));
    return await response.json();
  }

  public async getStatus(): Promise<StatusResponse> {
    const response = await fetch(this.getVersionedUrl("status"));
    return await response.json();
  }

  public async getFundInfo(): Promise<FundInfoResponse> {
    const response = await fetch(this.getVersionedUrl("catalyst/fundInfo"));
    return await response.json();
  }

}

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
  certType: "StakeRegistration" | "StakeDeregistration";
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
  readonly info: string;
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

export interface PoolDelegationRange {
  fromEpoch: number;
  toEpoch?: number;
}

export interface DelegationRangeResponse {
  hash: string;
  epoch: number;
  slot: number;
  txOrdinal: number;
  certOrdinal: number;
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

export interface TipStatusRequest {
  reference: { bestBlocks: string[]; };
}
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

export interface UTXOAtPointRequest {
  addresses: string[];
  referenceBlockHash: string;
  page: number;
  pageSize: number;
}

export interface UTXODiffSincePointRequest {
  addresses: string[];
    untilBlockHash: string;
    afterPoint: {
        blockHash: string;
        itemIndex?: number;
        txHash?: string;
    };
    diffLimit: number;
}

interface Asset {
  name: string;
  policy: string;
}

export interface UTXOAtPointResponse {
  utxoId: string;
  txHash: string;
  txIndex: number;
  receiver: string;
  amount: number;
  assets: Asset[];
  blockNum: number;
}

export interface UTXODiffSincePointResponse {
  blockHash: string;
  txHash: string;
  itemIndex: number;
  diffItems: {
    type: string;
    id: string;
    amount: number;
    receiver?: string;
    assets?: Asset[];
    blockNum?: number;
    txHash?: string;
    txIndex?: number;
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

export interface TxsHistoryRequest {
  addresses: string[];
  untilBlock: string;
  after: {
    tx: string;
    block: number;
  };
  limit: number;
}

export enum BlockEra {
  Byron = "byron",
  Shelley = "shelley",
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
  validContract: boolean;
  scriptSize: number;
  type: BlockEra;
  metadata: null | string;
  inputs: TransInputFrag[];
  txOrdinal: number;
  withdrawals: TransOutputFrag[];
  certificates: Certificate[];
  txState: string;
  lastUpdate: Date;
  blockNum: number;
  blockHash: string;
  time: Date;
  epoch: number;
  slot: number;
  collateralInputs: TransInputFrag[];
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

export type Output = Pick<Input, "address" | "address" | "assets"> & {
  dataHash: string | null;
};

export interface TXHashResponse {
  inputs: Input[];
  collateralInputs: Input[];
  outputs: Output[];
}

export interface TXOutputResponse {
  output: Output;
}

export interface GetTransactionsRequest {
  txHashes: string[];
}

export interface GetTransactionsObjectResponse {
  hash: string;
  fee: string;
  metadata: string | null;
  validContract: boolean;
  scriptSize: number;
  type: BlockEra;
  withdrawals: TransOutputFrag[];
  certificates: Certificate[];
  txOrdinal: number;
  txState: "Successful";
  lastUpdate: Date;
  blocNum: number;
  blockHash: string,
  time: Date;
  epoch: number;
  slot: number;
  inputs: TransInputFrag[];
  collateralInputs: TransInputFrag[];
  outputs: TransOutputFrag[];
}

export interface SignedTxsRequest {
  signedTx: string;
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

export interface GetMessageBoardRequest {
  poolIds: string[];
  fromBlock: string;
  untilBlock: string;
}

export interface GetMessageDirectRequest {
  poolId: string;
  fromBlock: string;
  untilBlock: string;
  address: string;
}

/******************************************************************************
 *  Types related to DataPoints
 ******************************************************************************/

export interface Datapoint {
  [address: string]: {
    blockNumber: number;
    blockDistance: number | null; // null if block parameter is not used
    txHash: string;
    txIndex: number;
    payload: string;
  };
}

export type DatapointResponse = Dictionary<Datapoint[]>;

export interface GetOracleDataPointRequest {
  addresses: string[];
  ticker: string;
  blockNum: string;
  source: string;
  count: number;
}

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
  pool_info: string;
  pool_id: string;
  cost: string;
  margin: string;
  pledge: string;
  non_myopic_member_rewards: number;
  produced_blocks: number;
  relative_stake: string;
}

export interface CardanoWalletRequest {
  limit: number;
  offset: number;
}

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
  metadata: string;
}

export interface GetAssetMinTxsResponse {
  policy: string;
  name: string;
  txs: string;
}
export interface MultiAssetMetadataResponse {
  [key: string]: MultiAssetTxMintMetadata[];
}

export interface PolicyIDResponse {
  policyIdResults: { [key: string]: boolean };
  fingerprintResults: { [key: string]: boolean };
}

export interface PolicyIDRequest {
  policyIds: string[];
  fingerprints: string[];
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

export interface TxStatusRequest {
  txHashes: string[];
}

export interface TxStatusResponse {
  depth: number;
  submissionStatus: {
    [key: string]: {
      status: string;
      reason: string;
    }
  };
}

export interface FundInfoResponse {
  [key: string]: {
      id: number;
      name: string;
      registrationStart: Date;
      registrationEnd: Date;
      votingStart: Date;
      votingEnd: Date;
      votingPowerThreshold: string;
  }
}