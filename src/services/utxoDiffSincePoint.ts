import config from "config";

import { Pool } from "pg";
import { Request, Response } from "express";
import { isNaN } from "lodash";

import { getBlock, getLatestBlock } from "../utils/queries/block";
import { assertNever, validateAddressesReq, getAddressesByType } from "../utils";

const addressesRequestLimit:number = config.get("server.addressRequestLimit");

enum DiffType {
  INPUT = "input",
  OUTPUT = "output"
}

const extractBodyParameters = (pool: Pool) => async (body: any): Promise<{
  addresses: string[],
  untilBlockHash: string,
  afterPoint: {blockHash: string, itemIndex?: number},
  lastFoundBestBlock?: string,
  lastFoundSafeBlock?: string
}> => {
  if(!body) {
    throw new Error("error, missing request body.");
  }

  const addresses: string[] = body.addresses;
  if(!addresses || addresses.length === 0) {
    throw new Error("error, no addresses.");
  }

  const untilBlockHash: string = body.untilBlockHash;
  if(!body.untilBlockHash) {
    throw new Error("error, no untilBlockHash.");
  }

  const afterBestBlocks: string[] = body.afterBestBlocks;
  const afterPointFromBody: {blockHash: string, itemIndex?: number | string} = body.afterPoint;
  let afterPoint: {blockHash: string, itemIndex?: number};
  if (afterBestBlocks && afterPointFromBody || (!afterBestBlocks && !afterPointFromBody)) {
    throw new Error("error, use either afterBestBlocks OR afterPoint.");
  }

  if (afterBestBlocks && afterBestBlocks.length === 0) {
    throw new Error("error, empty afterBestBlocks.");
  }

  if (afterPointFromBody) {
    if (!afterPointFromBody.blockHash) {
      throw new Error("error, missing blockHash in afterPoint.");
    }

    afterPoint = {blockHash: afterPointFromBody.blockHash};

    if (afterPointFromBody.itemIndex !== undefined && afterPointFromBody.itemIndex !== null) {
      if (isNaN(afterPointFromBody.itemIndex)) {
        throw new Error("error, itemIndex at afterPoint should be a number.");
      }

      afterPoint.itemIndex = typeof afterPointFromBody.itemIndex === "number"
        ? afterPointFromBody.itemIndex
        : parseInt(afterPointFromBody.itemIndex);
      
      if (afterPoint.itemIndex < 0) {
        throw new Error("error, itemIndex at afterPoint should be a positive number.");
      }
    }

    return {
      addresses,
      untilBlockHash,
      afterPoint
    };
  } else {
    const safeBlockDifference = parseInt(config.get("safeBlockDifference"));

    const bestBlockQuery = `SELECT encode(hash, 'hex') as "hash", block_no as "blockNumber"
      FROM block
      WHERE encode(hash, 'hex') = any(($1)::varchar array)
        AND block_no IS NOT NULL
      LIMIT 1`;

    const safeBlockQuery = `SELECT encode(hash, 'hex') as "hash", block_no as "blockNumber"
      FROM block
      WHERE encode(hash, 'hex') = any(($1)::varchar array)
        AND block_no IS NOT NULL
        AND block_no <= (SELECT MAX(block_no) FROM block) - ($2)::int
      LIMIT 1`;
    
    const bestBlockResult = await pool.query(bestBlockQuery, [afterBestBlocks]);
    if (bestBlockResult.rowCount === 0) {
      throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
    }
    const lastFoundBestBlock: string = bestBlockResult.rows[0].hash;

    const safeBlockResult = await pool.query(safeBlockQuery, [afterBestBlocks, safeBlockDifference]);
    if (safeBlockResult.rowCount === 0) {
      throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
    }
    const lastFoundSafeBlock: string = safeBlockResult.rows[0].hash;

    afterPoint = { blockHash: lastFoundBestBlock };

    return {
      addresses,
      untilBlockHash,
      afterPoint,
      lastFoundBestBlock,
      lastFoundSafeBlock
    };
  }
};

const buildSelectColumns = (type: DiffType) => {
  return `SELECT tx_out.address
  , encode(block.hash, 'hex') as "blockHash"
  , tx_out.payment_cred
  , encode(tx.hash,'hex') as hash
  , tx_out.index
  , tx_out.value
  , block.block_no as "blockNumber"
  , (
    select json_agg(ROW (encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
    from ma_tx_out
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

const buildWhereClause = (validContract: boolean, useItemIndex: boolean) => {
  return `WHERE ${validContract ? "" : "NOT "}tx.valid_contract
  AND block.block_no <= ($3)::uinteger
  ${
    useItemIndex
    ? `AND (
      block.block_no > ($4)::uinteger
      OR (
        block.block_no >= ($4)::uinteger
        AND tx_out.index > ($5)::uinteger
      )
    )`
    : "AND block.block_no > ($4)::uinteger"
  }
  AND (
    tx_out.address = any(($1)::varchar array) 
    OR tx_out.payment_cred = any(($2)::bytea array)
  )`;
};

const buildInputQuery = (useItemIndex: boolean) => {
  return `${buildSelectColumns(DiffType.INPUT)}
  ${buildSelectFromForInputs()}
  ${buildWhereClause(true, useItemIndex)}`;
};

const buildCollateralQuery = (useItemIndex: boolean) => {
  return `${buildSelectColumns(DiffType.INPUT)}
  ${buildSelectFromForCollaterals()}
  ${buildWhereClause(false, useItemIndex)}`;
};

const buildOutputQuery = (useItemIndex: boolean) => {
  return `${buildSelectColumns(DiffType.OUTPUT)}
  ${buildSelectFromForOutputs()}
  ${buildWhereClause(true, useItemIndex)}`;
};

const buildFullQuery = (useItemIndex: boolean) => {
  return `SELECT * FROM (
    ${buildInputQuery(useItemIndex)}
    UNION ALL
    ${buildCollateralQuery(useItemIndex)}
    UNION ALL
    ${buildOutputQuery(useItemIndex)}
  ) as q
  ORDER BY q."blockNumber", CASE q.type WHEN 'I' THEN 1 ELSE 0 END;`;
};

export const handleUtxoDiffSincePoint = (pool: Pool) => async (req: Request, res: Response) => {
  const {
    addresses,
    untilBlockHash,
    afterPoint,
    lastFoundBestBlock,
    lastFoundSafeBlock
  } = await extractBodyParameters(pool)(req.body);

  const untilBlock = await getBlock(pool)(untilBlockHash);
  if (!untilBlock) {
    throw new Error("REFERENCE_BESTBLOCK_NOT_FOUND");
  }

  const afterBlock = await getBlock(pool)(afterPoint.blockHash);
  if (!afterBlock) {
    throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
  }

  const addressTypes = getAddressesByType(addresses);
  const verifiedAddresses = validateAddressesReq(addressesRequestLimit, addresses);

  const fullQuery = buildFullQuery(afterPoint.itemIndex !== undefined);

  switch (verifiedAddresses.kind) {
    case "ok": {
      const queryParameters = [
        [
          ...addressTypes.legacyAddr,
          ...addressTypes.bech32,
        ]
        , addressTypes.paymentCreds
        , untilBlock.number
        , afterBlock.number
      ];

      if (afterPoint.itemIndex !== undefined) {
        queryParameters.push(afterPoint.itemIndex);
      }

      const result = await pool.query(
        fullQuery,
        queryParameters
      );

      const apiResponse = {} as any;
      if (lastFoundBestBlock) {
        apiResponse.lastFoundBestBlock = lastFoundBestBlock;
        apiResponse.lastFoundSafeBlock = lastFoundSafeBlock;
      }

      if (result.rows.length === 0) {
        apiResponse.diffItems = [];
        res.send(apiResponse);
      }

      const linearized = [];
      for (const row of result.rows) {
        const id = `${row.hash}:${row.index}`;
        if (row.type === "I") {
          linearized.push({
            type: DiffType.INPUT,
            id,
            amount: row.value
          });
        } else {
          linearized.push({
            type: DiffType.OUTPUT,
            id,
            receiver: row.adddress,
            amount: row.value,
            assets: row.assets,
            block_num: row.blockNumber
          });
        }
      }

      const lastRow = result.rows[result.rowCount - 1];

      apiResponse.lastDiffPointSelected = {
        blockHash: lastRow.blockHash,
        itemIndex: lastRow.index
      };
      apiResponse.diffItems = linearized;      

      res.send(apiResponse);
      break;
    }
    case "error":
      throw new Error(verifiedAddresses.errMsg);
    default: return assertNever(verifiedAddresses);
  }
};
