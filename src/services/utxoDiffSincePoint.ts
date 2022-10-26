import config from "config";

import { Pool } from "pg";
import { Request, Response } from "express";
import { isNaN } from "lodash";

import {
  getBlock,
  getBlockByNumber,
} from "../utils/queries/block";
import {
  assertNever,
  validateAddressesReq,
  getAddressesByType,
  extractAssets,
} from "../utils";

const addressesRequestLimit: number = config.get("server.addressRequestLimit");

enum DiffType {
  INPUT = "input",
  OUTPUT = "output",
}

const extractBodyParameters = async (
  body: any
): Promise<{
  addresses: string[];
  untilBlockHash: string;
  afterBlockHash: string;
  blockCount: number;
}> => {
  if (!body) {
    throw new Error("error, missing request body.");
  }

  const addresses: string[] = body.addresses;
  if (!addresses || addresses.length === 0) {
    throw new Error("error, no addresses.");
  }

  const untilBlockHash: string = body.untilBlockHash;
  if (!body.untilBlockHash) {
    throw new Error("error, no untilBlockHash.");
  }

  if (!body.blockCount) {
    throw new Error("error, no blockCount.");
  }
  const blockCount: number = body.blockCount;

  if (!body.afterBlockHash) {
    throw new Error("error, no afterBlockHash.");
  }
  const afterBlockHash: string = body.afterBlockHash;

  return {
    addresses,
    untilBlockHash,
    afterBlockHash,
    blockCount,
  };
};

const buildSelectColumns = (type: DiffType) => {
  return `SELECT tx_out.address
  , encode(block.hash, 'hex') as "blockHash"
  , tx_out.address
  , tx_out.payment_cred
  , encode(tx.hash,'hex') as hash
  , tx_out.index
  , tx_out.value
  , block.block_no as "blockNumber"
  , (
    select json_agg(ROW (encode(multi_asset."policy", 'hex'), encode(multi_asset."name", 'hex'), "quantity"))
    from ma_tx_out
      inner join multi_asset on ma_tx_out.ident = multi_asset.id
    where ma_tx_out."tx_out_id" = tx_out.id
  ) as assets
  , '${type === DiffType.OUTPUT ? "O" : "I"}' as "type"`;
};

const buildSelectFromForInputs = () => {
  return `FROM tx
  INNER JOIN block ON tx.block_id = block.id
  INNER JOIN tx_in ON tx.id = tx_in.tx_in_id
  INNER JOIN tx_out
    ON tx_out.tx_id = tx_in.tx_out_id
    AND tx_out.index::smallint = tx_in.tx_out_index::smallint`;
};

const buildSelectFromForCollaterals = () => {
  return `FROM tx
  INNER JOIN block ON tx.block_id = block.id
  INNER JOIN collateral_tx_in ON tx.id = collateral_tx_in.tx_in_id
  INNER JOIN tx_out
    ON tx_out.tx_id = collateral_tx_in.tx_out_id
    AND tx_out.index::smallint = collateral_tx_in.tx_out_index::smallint`;
};

const buildSelectFromForOutputs = () => {
  return `FROM tx
  INNER JOIN block ON tx.block_id = block.id
  INNER JOIN tx_out ON tx.id = tx_out.tx_id`;
};

const buildWhereClause = (validContract: boolean) => {
  return `WHERE ${validContract ? "" : "NOT "}tx.valid_contract
  AND block.block_no <= ($3)::word31type
  AND block.block_no > ($4)::word31type
  AND (
    tx_out.address = any(($1)::varchar array) 
    OR tx_out.payment_cred = any(($2)::bytea array)
  )`;
};

const buildInputQuery = () => {
  return `${buildSelectColumns(DiffType.INPUT)}
  ${buildSelectFromForInputs()}
  ${buildWhereClause(true)}`;
};

const buildCollateralQuery = () => {
  return `${buildSelectColumns(DiffType.INPUT)}
  ${buildSelectFromForCollaterals()}
  ${buildWhereClause(false)}`;
};

const buildOutputQuery = () => {
  return `${buildSelectColumns(DiffType.OUTPUT)}
  ${buildSelectFromForOutputs()}
  ${buildWhereClause(true)}`;
};

const buildFullQuery = () => {
  return `SELECT * FROM (
    ${buildInputQuery()}
    UNION ALL
    ${buildCollateralQuery()}
    UNION ALL
    ${buildOutputQuery()}
  ) as q
  ORDER BY q."blockNumber", CASE q.type WHEN 'I' THEN 1 ELSE 0 END;`;
};

export const handleUtxoDiffSincePoint =
  (pool: Pool) => async (req: Request, res: Response) => {
    const { addresses, untilBlockHash, afterBlockHash, blockCount } =
      await extractBodyParameters(req.body);

    const untilBlock = await getBlock(pool)(untilBlockHash);
    if (!untilBlock) {
      throw new Error("REFERENCE_BESTBLOCK_NOT_FOUND");
    }

    const afterBlock = await getBlock(pool)(afterBlockHash);
    if (!afterBlock) {
      throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
    }

    const addressTypes = getAddressesByType(addresses);
    const verifiedAddresses = validateAddressesReq(
      addressesRequestLimit,
      addresses
    );

    const fullQuery = buildFullQuery();

    switch (verifiedAddresses.kind) {
      case "ok": {
        const queryParameters: any[] = [
          [...addressTypes.legacyAddr, ...addressTypes.bech32],
          addressTypes.paymentCreds,
          Math.min(untilBlock.number, afterBlock.number + blockCount),
          afterBlock.number,
        ];

        const result = await pool.query(fullQuery, queryParameters);

        const apiResponse = {} as any;

        if (result.rows.length === 0) {
          apiResponse.diffItems = [];
          res.send(apiResponse);
          return;
        }

        const linearized = [];
        for (const row of result.rows) {
          const id = `${row.hash}:${row.index}`;
          if (row.type === "I") {
            linearized.push({
              type: DiffType.INPUT,
              id,
              amount: row.value,
            });
          } else {
            linearized.push({
              type: DiffType.OUTPUT,
              id,
              receiver: row.address,
              amount: row.value,
              assets: extractAssets(row.assets),
              block_num: row.blockNumber,
              tx_hash: row.hash,
              tx_index: row.index,
            });
          }
        }

        let lastBlockHash;
        if (afterBlock.number + blockCount < untilBlock.number) {
          const lastBlock = await getBlockByNumber(pool)(
            afterBlock.number + blockCount
          );
          if (!lastBlock) {
            throw new Error(`could not find block number ${afterBlock.number + blockCount}`);
          }
          lastBlockHash = lastBlock.hash;
        } else {
          lastBlockHash = afterBlock.hash;
        }

        apiResponse.lastBlockHash = lastBlockHash;
        apiResponse.diffItems = linearized;

        res.send(apiResponse);
        break;
      }
      case "error":
        throw new Error(verifiedAddresses.errMsg);
      default:
        return assertNever(verifiedAddresses);
    }
  };
