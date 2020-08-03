
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
