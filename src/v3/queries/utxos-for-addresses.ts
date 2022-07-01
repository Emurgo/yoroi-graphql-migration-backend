import { Collection } from "mongodb";
import { mapAddresses } from "../utils";

export const getUtxosForAddresses = (
  blocksCollection: Collection
) => (
  addresses: string[]
) => {
  const addressTypes = mapAddresses(addresses);
  const addressFilters: any[] = [];
  addressTypes.legacyAddr.forEach(p => {
    addressFilters.push({"address": p});
  });
  addressTypes.bech32.forEach(p => {
    addressFilters.push({"address": p});
  });
  addressTypes.paymentCreds.forEach(p => {
    addressFilters.push({"payment_cred": p});
    addressFilters.push({"stake_cred": p});
  });

  const utxosCursor = blocksCollection.aggregate([
    // get outputs for addresses
    {
      $match: {
        transactions: {
          $elemMatch: {
            outputs: {
              $elemMatch: {
                $or: addressFilters
              }
            }
          }
        }
      }
    },
    // replicate all returned blocks by TX
    {
      $unwind: { path: "$transactions" }
    },
    // replicate the above by output
    {
      $unwind: { path: "$transactions.outputs", includeArrayIndex: "index" }
    },
    // get only the fields we need
    {
      $project: {
        address: "$transactions.outputs.address",
        amount: "$transactions.outputs.amount",
        assets: "$transactions.outputs.assets",
        payment_cred: "$transactions.outputs.payment_cred",
        stake_cred: "$transactions.outputs.stake_cred",
        data_hash: "$transactions.outputs.data_hash",
        block_num: "$number",
        tx_hash: "$transactions.hash",
        tx_index: "$index",
        id: {
          $concat: [
            "$transactions.hash",
            ":",
            {$toString: "$index"}
          ]
        }
      }
    },
    // filter out outputs from other addresses
    {
      $match: {
        $or: addressFilters
      }
    },
    // get where (if) the output was used as an input
    {
      $lookup: {
        from: "spent_outputs",
        localField: "id",
        foreignField: "id",
        as: "generated_input"
      }
    },
    // filter out used (spent) outputs
    {
      $match: {
        "generated_input": {
          $size: 0
        }
      }
    }
  ]);

  return utxosCursor;
};