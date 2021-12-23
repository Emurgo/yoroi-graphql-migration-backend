import { extractAssets } from "../utils";

import {
  rowToCertificate,
  BlockEra,
  BlockFrag,
  Certificate,
  TransInputFrag,
  TransOutputFrag,
  TransactionFrag,
  Asset,
} from "../Transactions/types";

import {
  GeneralTransactionMetadata,
  TransactionMetadatum,
  BigNum,
} from "@emurgo/cardano-serialization-lib-nodejs";

const MAX_INT = "2147483647";

export const mapTxRowsToTransactionFrags = (rows: any[]): TransactionFrag[] => {
  return rows.map((row: any): TransactionFrag => {
    const inputs = row.inAddrValPairs
      ? row.inAddrValPairs.map(
          (obj: any): TransInputFrag => ({
            address: obj.f1,
            amount: obj.f2.toString(),
            id: obj.f3.concat(obj.f4.toString()),
            index: obj.f4,
            txHash: obj.f3,
            assets: extractAssets(obj.f5),
          })
        )
      : [];
    const collateralInputs = row.collateralInAddrValPairs
      ? row.collateralInAddrValPairs.map(
          (obj: any): TransInputFrag => ({
            address: obj.f1,
            amount: obj.f2.toString(),
            id: obj.f3.concat(obj.f4.toString()),
            index: obj.f4,
            txHash: obj.f3,
            assets: extractAssets(obj.f5),
          })
        )
      : [];
    const outputs = row.outAddrValPairs
      ? row.outAddrValPairs.map(
          (obj: any): TransOutputFrag => ({
            address: obj.f1,
            amount: obj.f2.toString(),
            dataHash: obj.f3,
            assets: extractAssets(obj.f4),
          })
        )
      : [];
    const withdrawals: TransOutputFrag[] = row.withdrawals
      ? row.withdrawals.map(
          (obj: any): TransOutputFrag => ({
            address: obj.f1,
            amount: obj.f2.toString(),
            dataHash: null,
            assets: [] as Asset[],
          })
        )
      : [];
    const certificates =
      row.certificates !== null
        ? row.certificates
            .map(rowToCertificate)
            .filter((i: Certificate | null) => i !== null)
        : [];
    const blockFrag: BlockFrag = {
      number: row.blockNumber,
      hash: row.blockHash.toString("hex"),
      epochNo: row.blockEpochNo,
      slotNo: row.blockSlotInEpoch,
    };
    return {
      hash: row.hash.toString("hex"),
      block: blockFrag,
      validContract: row.valid_contract,
      scriptSize: row.script_size,
      fee: row.fee.toString(),
      metadata: buildMetadataObj(row.metadata),
      includedAt: row.includedAt,
      inputs: inputs,
      collateralInputs: collateralInputs,
      outputs: outputs,
      ttl: MAX_INT, // https://github.com/input-output-hk/cardano-db-sync/issues/212
      blockEra: row.blockEra === "byron" ? BlockEra.Byron : BlockEra.Shelley,
      txIndex: row.txIndex,
      withdrawals: withdrawals,
      certificates: certificates,
    };
  });
};

export const mapTransactionFragsToResponse = (txs: TransactionFrag[]) => {
  return txs.map((tx) => mapTransactionFragToResponse(tx));
};

export const mapTransactionFragToResponse = (tx: TransactionFrag) => {
  return {
    hash: tx.hash,
    fee: tx.fee,
    metadata: tx.metadata,
    valid_contract: tx.validContract,
    script_size: tx.scriptSize,
    //ttl: tx.ttl,
    type: tx.blockEra,
    withdrawals: tx.withdrawals,
    certificates: tx.certificates,
    tx_ordinal: tx.txIndex,
    tx_state: "Successful", // graphql doesn't handle pending/failed txs
    last_update: tx.includedAt,
    block_num: tx.block.number,
    block_hash: tx.block.hash,
    time: tx.includedAt,
    epoch: tx.block.epochNo,
    slot: tx.block.slotNo,
    inputs: tx.inputs,
    collateral_inputs: tx.collateralInputs,
    outputs: tx.outputs,
  };
};

function buildMetadataObj(
  metadataMap: null | Record<string, string>
): null | string {
  if (metadataMap == null) return null;
  const metadataWasm = GeneralTransactionMetadata.new();
  for (const key of Object.keys(metadataMap)) {
    const keyWasm = BigNum.from_str(key);
    // the cbor inserted into SQL is not the full metadata for the transaction
    // instead, each row is a CBOR map with a single entry <transaction_metadatum_label, transaction_metadatum>
    const singletonMap = TransactionMetadatum.from_bytes(
      Buffer.from(
        // need to cutoff the \\x prefix added by SQL
        metadataMap[key].substring(2),
        "hex"
      )
    );
    const map = singletonMap.as_map();
    const keys = map.keys();
    for (let i = 0; i < keys.len(); i++) {
      const cborKey = keys.get(i);
      const datumWasm = map.get(cborKey);
      metadataWasm.insert(keyWasm, datumWasm);
      datumWasm.free();
      cborKey.free();
    }
    keyWasm.free();
    singletonMap.free();
    map.free();
    keys.free();
  }
  const result = Buffer.from(metadataWasm.to_bytes()).toString("hex");
  metadataWasm.free();

  return result;
}
