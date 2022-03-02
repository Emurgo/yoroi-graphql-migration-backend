import config from "config";

import { Pool } from "pg";
import { Request, Response } from "express";
import { isNaN } from "lodash";

import { getBlock } from "../utils/queries/block";
import { assertNever, validateAddressesReq, getAddressesByType, extractAssets } from "../utils";

const addressesRequestLimit:number = config.get("server.addressRequestLimit");

enum DiffType {
  INPUT = "input",
  OUTPUT = "output"
}

const extractBodyParameters = async (body: any): Promise<{
  addresses: string[],
  untilBlockHash: string,
  afterPoint: {blockHash: string, itemIndex?: number, txHash?: string},
  diffLimit: number
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

  if (!body.diffLimit) {
    throw new Error("error, no diffLimit.");
  }

  const diffLimit: number = body.diffLimit;

  const afterPointFromBody: {blockHash: string, itemIndex?: number | string, txHash?: string} = body.afterPoint;

  if (!afterPointFromBody) {
    throw new Error("error, empty afterBestBlocks.");
  }

  if (!afterPointFromBody.blockHash) {
    throw new Error("error, missing blockHash in afterPoint.");
  }

  const afterPoint: {blockHash: string, itemIndex?: number, txHash?: string} = {
    blockHash: afterPointFromBody.blockHash
  };

  if (afterPointFromBody.itemIndex !== undefined || afterPointFromBody.txHash) {
    if (!(afterPointFromBody.itemIndex !== undefined && afterPointFromBody.txHash)) {
      throw new Error("error, if itemIndex or txHash are informed, both should be.");
    }
  }

  if (afterPointFromBody.itemIndex !== undefined && afterPointFromBody.itemIndex !== null) {
    if (isNaN(afterPointFromBody.itemIndex)) {
      throw new Error("error, itemIndex at afterPoint should be a number.");
    }

    afterPoint.itemIndex = typeof afterPointFromBody.itemIndex === "number"
      ? afterPointFromBody.itemIndex
      : parseInt(afterPointFromBody.itemIndex);
    
    if (afterPoint.itemIndex < 0) {
      throw new Error("error, itemIndex at afterPoint should be a positive number or zero.");
    }

    afterPoint.txHash = afterPointFromBody.txHash;
  }

  return {
    addresses,
    untilBlockHash,
    afterPoint,
    diffLimit
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

const buildWhereClause = (validContract: boolean, useItemIndex: boolean) => {
  return `WHERE ${validContract ? "" : "NOT "}tx.valid_contract
  AND block.block_no <= ($3)::uinteger
  ${
    useItemIndex
    ? `AND (
      block.block_no > ($4)::uinteger
      OR (
        block.block_no >= ($4)::uinteger
        AND encode(tx.hash,'hex') = ($5)::varchar
        AND tx_out.index > ($6)::uinteger
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
  ORDER BY q."blockNumber", CASE q.type WHEN 'I' THEN 1 ELSE 0 END
  LIMIT $${5 + (useItemIndex ? 2 : 0)}::uinteger;`;
};

export const handleUtxoDiffSincePoint = (pool: Pool) => async (req: Request, res: Response) => {
  const {
    addresses,
    untilBlockHash,
    afterPoint,
    diffLimit
  } = await extractBodyParameters(req.body);

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
      const queryParameters: any[] = [
        [
          ...addressTypes.legacyAddr,
          ...addressTypes.bech32,
        ]
        , addressTypes.paymentCreds
        , untilBlock.number
        , afterBlock.number
      ];

      if (afterPoint.itemIndex !== undefined) {
        queryParameters.push(afterPoint.txHash);
        queryParameters.push(afterPoint.itemIndex);
      }

      queryParameters.push(diffLimit);

      const result = await pool.query(
        fullQuery,
        queryParameters
      );

      const apiResponse = {} as any;

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
            receiver: row.address,
            amount: row.value,
            assets: extractAssets(row.assets),
            block_num: row.blockNumber,
            tx_hash: row.hash,
            tx_index: row.index,
          });
        }
      }

      const lastRow = result.rows[result.rowCount - 1];

      apiResponse.lastDiffPointSelected = {
        blockHash: lastRow.blockHash,
        txHash: lastRow.hash,
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
