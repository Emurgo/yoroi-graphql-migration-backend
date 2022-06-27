import { Request, Response } from "express";
import { Db } from "mongodb";
import { getAddressesByType } from "../../utils";
import { Address, BigInt, BigNum, ByronAddress, Ed25519KeyHash, GeneralTransactionMetadata, Int, MetadataList, MetadataMap, RewardAddress, StakeCredential, TransactionMetadatum } from "@emurgo/cardano-serialization-lib-nodejs";
import { decode, fromWords } from "bech32";
import { Prefixes } from "../../utils/cip5";

const GENESIS_UNIX_TIMESTAMP = 1506243091;
const SHELLEY_UNIX_TIMESTAMP = 1596491091;
const SHELLEY_INITIAL_SLOT = 4924800;
const BYRON_SLOT_DURATION_IN_SECONDS = 20;

export const txsHistoryHandler = (
  db: Db
) => async (
  req: Request, res: Response
) => {
  const blocksCollection = db.collection("blocks");

  const addresses = req.body.addresses as string[];
  const limit = req.body.limit as number ?? 50;
  const untilBlockHash = req.body.untilBlock as string;
  const after = req.body.after as { block: string, tx: string } | undefined;

  const untilBlock = await blocksCollection.findOne({
    hash: untilBlockHash,
  }, {
    projection: {
      hash: "$hash",
      number: "$number"
    }
  });
  if (!untilBlock) throw new Error("REFERENCE_BEST_BLOCK_MISMATCH");

  let afterBlock: {
    hash: string,
    number: number,
    tx_ordinal: number
  } | undefined;
  let referenceTxIndex: number | undefined;
  if (after) {
    const cursor = blocksCollection.aggregate([
      {
        $match: {
          hash: after.block
        }
      },
      {
        $unwind: {
          path: "$transactions",
          includeArrayIndex: "tx_ordinal"
        }
      },
      {
        $match: {
          "transactions.hash": after.tx
        }
      },
      {
        $limit: 1
      }
    ]);

    afterBlock = (await cursor.next() as any);
    if (!afterBlock) throw new Error("REFERENCE_BLOCK_MISMATCH");

    referenceTxIndex = afterBlock.tx_ordinal;
  }

  const mappedAddresses = mapAddresses(addresses);

  const addressFilters: any[] = [];
  mappedAddresses.legacyAddr.forEach(p => {
    addressFilters.push({"transactions.outputs.address": p});
    addressFilters.push({"transactions.inputs.source.address": p});

    addressFilters.push({"transactions.outputs.address": p});
    addressFilters.push({"transactions.inputs.source.address": p});
  });
  mappedAddresses.bech32.forEach(p => {
    addressFilters.push({"transactions.outputs.address": p});
    addressFilters.push({"transactions.inputs.source.address": p});

    addressFilters.push({"transactions.outputs.address": p});
    addressFilters.push({"transactions.inputs.source.address": p});
  });
  mappedAddresses.paymentCreds.forEach(p => {
    addressFilters.push({"transactions.outputs.payment_cred": p});
    addressFilters.push({"transactions.inputs.source.payment_cred": p});

    addressFilters.push({"transactions.outputs.stake_cred": p});
    addressFilters.push({"transactions.inputs.source.stake_cred": p});
  });
  // mappedAddresses.stakingKeys.forEach(p => {
  //   filters.push({"transactions.certificates.payment_cred": p});
  //   filters.push({"transactions.inputs.source.payment_cred": p});

  //   filters.push({"transactions.outputs.stake_cred": p});
  //   filters.push({"transactions.inputs.source.stake_cred": p});
  // });

  const blockFilter = afterBlock
    ? {
      $and: [
        { number: { $lte: untilBlock.number } },
        { number: { $gte: afterBlock.number } }
      ]
    }
    : {
      number: {
        $lte: untilBlock.number
      }
    };

  const txsFilter = referenceTxIndex && afterBlock
    ? {
      $match: {
        $and: [
          {
            $or: addressFilters
          },
          { number: { $lte: untilBlock.number } },
          {
            $or: [
              { number: { $gt: afterBlock.number } },
              {
                $and: [
                  { number: { $eq: afterBlock.number } },
                  { tx_ordinal: { $gt: referenceTxIndex } }
                ]
              }
            ]
          }
        ]
      }
    }
    : {
      $match: {
        $or: addressFilters
      }
    };

  const cursor = blocksCollection.aggregate([
    {
      $match: {
        $and: [
          { $or: addressFilters },
          blockFilter
        ]
      }
    },
    {
      $unwind: {
        path: "$transactions",
        includeArrayIndex: "tx_ordinal"
      }
    },
    txsFilter,
    {
      $sort: {
        number: 1,
        tx_ordinal: 1
      }
    },
    {
      $limit: limit
    }
  ]);

  const transactions: any[] = [];
  while (await cursor.hasNext()) {
    const document: any = await cursor.next();
    if (!document) continue;
    transactions.push({
      hash: document.transactions.hash,
      fee: document.transactions.fee.toString(),
      metadata: document.transactions.metadata
        ? buildMetadataObj(document.transactions.metadata)
        // ? document.transactions.metadata
        : null,
      valid_contract: document.transactions.is_valid,
      script_size: document.transactions.scripts
        ? getScriptsSize(document.transactions.scripts)
        : 0,
      type: document.era === "Byron"
        ? "byron"
        : "shelley",
      withdrawals: document.transactions.withdrawals,
      certificates: document.transactions.certificates,
      tx_ordinal: document.tx_ordinal,
      tx_state: "Successful",
      last_update: blockDate(document),
      block_num: document.number,
      block_hash: document.hash,
      time: blockDate(document),
      epoch: document.epoch,
      slot: document.epoch_slot,
      inputs: document.transactions.inputs.map((i: any) => ({
        address: i.source.address,
        amount: i.source.amount.toString(),
        id: `${i.tx_id}${i.index}`,
        index: i.index,
        txHash: i.tx_id,
        assets: i.source.assets.map((a: any) => ({
          assetId: `${a.policy}.${a.asset}`,
          policyId: a.policy,
          name: a.asset,
          amount: a.amount.toString()
        }))
      })),
      collateral_inputs: document.transactions.collateral_inputs.map((i: any) => ({
        address: i.source.address,
        amount: i.source.amount,
        id: `${i.tx_id}${i.index}`,
        index: i.index,
        txHash: i.tx_id,
        assets: i.source.assets.map((a: any) => ({
          assetId: `${a.policy}.${a.asset}`,
          policyId: a.policy,
          name: a.asset,
          amount: a.amount.toString()
        }))
      })),
      outputs: document.transactions.outputs.map((i: any) => ({
        address: i.address,
        amount: i.amount.toString(),
        dataHash: null,
        assets: i.assets.map((a: any) => ({
          assetId: `${a.policy}.${a.asset}`,
          policyId: a.policy,
          name: a.asset,
          amount: a.amount.toString()
        }))
      })),
    });
  }
  
  return res.send(transactions);
};

const buildMetadataObj = (
  metadataMap: any[]
): null | string => {
  const getMetadatum = (o: any) => {
    if (typeof o === "object") {
      if (Array.isArray(o)) {
        const metadataList = MetadataList.new();
        for (const item of o) {
          metadataList.add(getMetadatum(item));
        }
        return TransactionMetadatum.new_list(metadataList);
      } else {
        const metadataMap = MetadataMap.new();
        for (const key of Object.keys(o)) {
          const value = getMetadatum(o[key]);
          metadataMap.insert(TransactionMetadatum.new_text(key), value);
        }
        return TransactionMetadatum.new_map(metadataMap);
      }
    } else if (typeof o === "number") {
      return TransactionMetadatum.new_int(Int.new_i32(o));
    } else if (typeof o === "string") {
      return TransactionMetadatum.new_text(o);
    }
    throw new Error("unexpected metadata value type");
  };

  const metadataWasm = GeneralTransactionMetadata.new();
  for (const meta of metadataMap) {
    const metadatum = getMetadatum(meta.map_json);
    metadataWasm.insert(BigNum.from_str(meta.label), metadatum);
  }
  const result = Buffer.from(metadataWasm.to_bytes()).toString("hex");
  metadataWasm.free();

  return result;
};

const mapAddresses = (addresses: string[]) => {
  const HEX_REGEXP = RegExp("^[0-9a-fA-F]+$");

  const legacyAddr: string[] = [];
  const bech32: string[] = [];
  const paymentCreds: string[] = [];
  const stakingKeys: string[] = [];
  for (const address of addresses) {
    if (ByronAddress.is_valid(address)) {
      legacyAddr.push(address);
      continue;
    }

    try {
      const bech32Info = decode(address, 1000);
      switch (bech32Info.prefix) {
        case Prefixes.ADDR: {
          bech32.push(address);
          break;
        }
        case Prefixes.ADDR_TEST: {
          bech32.push(address);
          break;
        }
        case Prefixes.STAKE: {
          const wasmBech32 = Address.from_bech32(address);
          stakingKeys.push(
            `${Buffer.from(wasmBech32.to_bytes()).toString("hex")}`
          );
          wasmBech32.free();
          break;
        }
        case Prefixes.STAKE_TEST: {
          const wasmBech32 = Address.from_bech32(address);
          stakingKeys.push(
            `${Buffer.from(wasmBech32.to_bytes()).toString("hex")}`
          );
          wasmBech32.free();
          break;
        }
        case Prefixes.PAYMENT_KEY_HASH: {
          const keyHash = Ed25519KeyHash.from_bech32(address);
          const paymentCred = StakeCredential.from_keyhash(keyHash);
          paymentCreds.push(Buffer.from(paymentCred.to_bytes()).toString("hex"));
          break;
        }
        default:
          continue;
      }
      continue;
    } catch (_e) {
      // silently discard any non-valid Cardano addresses
    }
    try {
      if (HEX_REGEXP.test(address)) {
        const wasmAddr = Address.from_bytes(Buffer.from(address, "hex"));
        if (validateRewardAddress(wasmAddr)) {
          stakingKeys.push(`\\x${address}`);
        }
        wasmAddr.free();
        continue;
      }
    } catch (_e) {
      // silently discard any non-valid Cardano addresses
    }
  }
  return {
    legacyAddr,
    bech32,
    paymentCreds,
    stakingKeys
  };
};

const validateRewardAddress = (wasmAddr: Address) => {
  const rewardAddr = RewardAddress.from_address(wasmAddr);
  return rewardAddr != null;
};

const blockDate = (block: { era: string, slot: number }) => {
  return block.era === "Byron"
  ? byronDateFromSlot(block.slot)
  : shelleyDateFromSlot(block.slot);
};

const byronDateFromSlot = (slot: number) => {
  const unix = GENESIS_UNIX_TIMESTAMP + (slot * BYRON_SLOT_DURATION_IN_SECONDS);
  return new Date(unix * 1000);
};

const shelleyDateFromSlot = (slot: number) => {
  const unix = SHELLEY_UNIX_TIMESTAMP + (slot - SHELLEY_INITIAL_SLOT);
  return new Date(unix * 1000);
};

const getScriptsSize = (scripts: any[]) => {
  return scripts.reduce((prev, curr) => {
    const size = curr.script_hex
      ? Buffer.from(curr.script_hex, "hex").length
      : 0;
    return prev + size;
  }, 0);
};
