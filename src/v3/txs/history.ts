import { Request, Response } from "express";
import {
  Address,
  ByronAddress,
  Ed25519KeyHash,
  RewardAddress,
  StakeCredential
} from "@emurgo/cardano-serialization-lib-nodejs";
import { Pool } from "pg";
import { TransInputFrag, TransOutputFrag } from "../../Transactions/types";

const getAddressesByType = (addresses: string[]) => {
  const hexAddresses = [] as string[];
  const paymentCreds = [] as string[];
  const addrKeyHashes = [] as string[];
  const rewardAddresses = [] as string[];

  for (const address of addresses) {
    if (ByronAddress.is_valid(address)) {
      const hex = Buffer.from(
        ByronAddress.from_base58(address).to_address().to_bytes()
      ).toString("hex");
      hexAddresses.push(`\\x${hex}`);
      continue;
    }

    if (address.startsWith("addr_vkh")) {
      const keyHash = Ed25519KeyHash.from_bech32(address);
      const cred = StakeCredential.from_keyhash(keyHash);
      const hex = Buffer.from(cred.to_bytes()).toString("hex");
      paymentCreds.push(`\\x${hex}`);
      continue;
    }

    if (address.startsWith("addr") || address.startsWith("addr_test")) {
      const hex = Buffer.from(
        Address.from_bech32(address).to_bytes()
      ).toString("hex");
      hexAddresses.push(`\\x${hex}`);
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
  }

  return {
    hexAddresses,
    paymentCreds,
    addrKeyHashes,
    rewardAddresses
  };
};

const getBlockNumberByHash = (pool: Pool) => async (hash: string) => {
  const results = await pool.query(
    "SELECT height FROM \"Block\" WHERE hash = decode($1, 'hex')",
    [hash]
  );
  if (results.rowCount === 0) throw new Error("REFERENCE_BEST_BLOCK_MISMATCH");
  return results.rows[0].height as number;
};

export const history = (pool: Pool) => ({
  handler: async (req: Request, res: Response) => {
    const addresses = req.body.addresses as string[];

    const untilBlock = await getBlockNumberByHash(pool)(req.body.untilBlock);

    const {
      paymentCreds,
    } = getAddressesByType(addresses);

    // ToDo: add filters per address
    const query = `WITH addresses AS (
      SELECT addr.id
      FROM "StakeCredential" sc
          INNER JOIN "AddressCredentialRelation" acr on sc.id = acr.credential_id
          INNER JOIN "Address" addr on acr.address_id = addr.id
      WHERE credential = ANY(($1)::bytea array)
  ), tx_ids AS (
      SELECT tx.id
      FROM "Transaction" tx
          INNER JOIN "TransactionOutput" o on tx.id = o.tx_id
      WHERE o.address_id IN (
          SELECT id FROM addresses
      )
      UNION
      SELECT tx.id
      FROM "Transaction" tx
          INNER JOIN "TransactionInput" i on tx.id = i.tx_id
          INNER JOIN "TransactionOutput" o on i.utxo_id = o.id
      WHERE o.address_id IN (
          SELECT id FROM addresses
      )
  )
  SELECT encode(tx.hash, 'hex') as "hash",
      0 as fee,
      tx.is_valid as valid_contract,
      0 as script_size,
      meta.payload as metadata,
      tx.tx_index as "txIndex",
      block.height as "blockNumber",
      encode(block.hash, 'hex') as "blockHash",
      block.epoch as "blockEpochNo",
      block.slot as "blockSlotNo"
  FROM "Transaction" tx
      INNER JOIN "Block" block on tx.block_id = block.id
      LEFT JOIN "TransactionMetadata" meta on tx.id = meta.tx_id
  WHERE tx.id IN (
      SELECT id from tx_ids
  ) AND (
    block.height <= $2
    AND (
      block.height > $3
      OR (
        block.height = $3
        AND tx.tx_index > $4
      )
    )
  )
  ORDER BY block.height asc, tx.tx_index asc
  LIMIT 50`;

    const results = await pool.query(query, [
      paymentCreds,
      untilBlock,
      0, 0
    ]);

    const txs = results.rows.map(r => {
      return {
        hash: r.hash,
        fee: 0, // ToDo: missing fee?
        metadata: r.metadata,
        validContract: r.valid_contract,
        scriptSize: 0, // ToDo: missing script size?
        type: "shelley", // ToDo: missing way to determine block era?
        withdrawals: [], // ToDo: missing withdrawals?
        certificates: [], // ToDo: missing certificates?
        txOrdinal: r.tx_index,
        txState: "Successful",
        lastUpdate: new Date(), // ToDo: calculate lastUpdate
        blockNum: r.blockNumber,
        blockHash: r.blockHash,
        time: new Date(), // ToDo: calculate lastUpdate
        epoch: r.blockEpochNo,
        slot: r.blockSlotNo,
        inputs: r.inAddrValPairs
        ? r.inAddrValPairs.map(
            (obj: any): TransInputFrag => ({
              address: obj.f1,
              amount: obj.f2.toString(),
              id: obj.f3.concat(obj.f4.toString()),
              index: obj.f4,
              txHash: obj.f3,
              assets: [], // ToDo: missing assets?
            })
          )
        : [],
        collateralInputs: [], // ToDo: missing collateral inputs?
        outputs: r.outAddrValPairs
        ? r.outAddrValPairs.map(
            (obj: any): TransOutputFrag => ({
              address: obj.f1,
              amount: obj.f2.toString(),
              dataHash: obj.f3?.toString() ?? null,
              assets: [], // ToDo: missing assets?
            })
          )
        : [],
      };
    });

    return res.send(txs);
  }
});