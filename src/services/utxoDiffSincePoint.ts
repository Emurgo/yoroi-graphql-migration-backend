import config from "config";

import { Pool } from "pg";
import { Request, Response } from "express";

import {
  getBlock,
  getLatestBestBlockFromHashes,
  getLatestSafeBlockFromHashes,
} from "../utils/queries/block";
import { getTransactionRowByHash } from "../utils/queries/transaction";
import {
  assertNever,
  validateAddressesReq,
  getAddressesByType,
  extractAssets,
} from "../utils";

const addressesRequestLimit: number = config.get("server.addressRequestLimit");

enum DiffItemType {
  INPUT = "input",
  COLLATERAL = "collateral",
  OUTPUT = "output",
}

const extractBodyParameters = async (
  body: any
): Promise<{
  addresses: string[];
  untilBlockHash: string;
  afterBestblocks?: Array<string>;
  afterPoint?: {
    blockHash: string;
    paginationPointType: DiffItemType | null;
    // if paginationPointType is not null, these two fields must be present
    txHash?: string;
    /*
      if paginationPointType is INPUT, this is `tx_in.id`;
      if paginationPointType is COLLATERAL, this is `collateral_tx_id.id`;
      if paginationPointType is OUTPU, this is `tx_out.index`;
    */
    paginationPointValue?: string;
  };
  diffLimit: number;
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

  if (!body.diffLimit) {
    throw new Error("error, no diffLimit.");
  }

  const diffLimit: number = body.diffLimit;

  const afterBestblocks: Array<string> | undefined = body.afterBestblocks;
  const afterPoint: {
    blockHash: string;
    paginationPointType: DiffItemType | null;
    txHash?: string;
    paginationPointValue?: string;
  } | undefined = body.afterPoint;

  if (afterPoint == null) {
    if (afterBestblocks == null) {
      throw new Error("error, one of `afterBestblocks` or `afterPoint` is required");
    }
    if (!Array.isArray(afterBestblocks) || afterBestblocks.length === 0) {
      throw new Error("error, `afterBestblocks` is expected to be a non empty array of block hashes");
    }
  } else {
    if (afterBestblocks != null) {
      throw new Error("error, only one of `afterBestblocks` or `afterPoint` is expected");
    }
    if (afterPoint.blockHash == null) {
      throw new Error("error, missing blockHash in afterPoint.");
    }
    if (afterPoint.paginationPointType == null) {
      afterPoint.paginationPointType = null;
    } else if (
      ![
        DiffItemType.INPUT,
        DiffItemType.COLLATERAL,
        DiffItemType.OUTPUT,
      ].includes(afterPoint.paginationPointType)
    ) {
      throw new Error("error, unexpected paginationPointType in afterPoint.");
    }

    if (
      afterPoint.paginationPointType !== null &&
      typeof afterPoint.txHash !== "string"
    ) {
      throw new Error("error, missing txHash in afterPoint.");
    }

    if (
      afterPoint.paginationPointType !== null &&
      typeof afterPoint.paginationPointValue !== "string"
    ) {
      throw new Error("error, missing paginationPointValue in afterPoint.");
    }
  }

  return {
    addresses,
    untilBlockHash,
    afterPoint,
    afterBestblocks,
    diffLimit,
  };
};

const buildSelectColumns = (diffItemType: DiffItemType) => {
  let paginationPointColumn;
  if (diffItemType === DiffItemType.INPUT) {
    paginationPointColumn = "tx_in.id";
  } else if (diffItemType === DiffItemType.COLLATERAL) {
    paginationPointColumn = "collateral_tx_in.id";
  } else {
    paginationPointColumn = "tx_out.index";
  }

  return `SELECT tx_out.address
  , encode(block.hash, 'hex') as "blockHash"
  , tx_out.address
  , tx_out.payment_cred
  , encode(tx.hash,'hex') as hash
  , tx_out.index
  , tx_out.value
  , block.block_no as "blockNumber"
  , tx.block_index as "blockIndex"
  , (
    select json_agg(ROW (encode(multi_asset."policy", 'hex'), encode(multi_asset."name", 'hex'), "quantity"))
    from ma_tx_out
      inner join multi_asset on ma_tx_out.ident = multi_asset.id
    where ma_tx_out."tx_out_id" = tx_out.id
  ) as assets
  , '${diffItemType}' as "diffItemType"
  , ${paginationPointColumn} as "paginationPointValue"`;
};

const buildSelectFromForInputs = () => {
  return `FROM tx
  INNER JOIN block ON tx.block_id = block.id
  INNER JOIN tx_in ON tx.id = tx_in.tx_in_id
  INNER JOIN tx_out
    ON tx_out.tx_id = tx_in.tx_out_id
    AND tx_out.index::smallint = tx_in.tx_out_index::smallint
  INNER JOIN tx src_tx
    ON tx_out.tx_id = src_tx.id`;
};

const buildSelectFromForCollaterals = () => {
  return `FROM tx
  INNER JOIN block ON tx.block_id = block.id
  INNER JOIN collateral_tx_in ON tx.id = collateral_tx_in.tx_in_id
  INNER JOIN tx_out
    ON tx_out.tx_id = collateral_tx_in.tx_out_id
    AND tx_out.index::smallint = collateral_tx_in.tx_out_index::smallint
  INNER JOIN tx src_tx
    ON tx_out.tx_id = src_tx.id`;
};

const buildSelectFromForOutputs = () => {
  return `FROM tx
  INNER JOIN block ON tx.block_id = block.id
  INNER JOIN tx_out ON tx.id = tx_out.tx_id`;
};

const buildWhereClause = (
  validContract: boolean,
  // for which diff item we are building the where clause
  diffItemType: DiffItemType,
  // the type of pagination point passed in by the client
  paginationPoinType: DiffItemType | null
) => {
  let linearizedOrderCond;
  if (paginationPoinType === null) {
    linearizedOrderCond = "(block.block_no > ($4)::word31type)";
  } else if (paginationPoinType === DiffItemType.INPUT) {
    // the linear order is input < collateral < output
    if (diffItemType === DiffItemType.INPUT) {
      linearizedOrderCond = `(
          /* following blocks */
          block.block_no > ($4)::word31type
        OR (
          /* the same block, following txs */
          block.block_no = ($4)::word31type
          AND tx.block_index > ($6)::word31type
        ) OR (
          /* the same tx, following inputs */
          block.block_no = ($4)::word31type
          AND tx.block_index = ($6)::word31type
          AND tx_in.id > ($5)::integer
        )
      )`;
    } else {
      // diffItemType === DiffItemType.COLLATERAL || diffItemType === DiffItemType.OUTPUT
      linearizedOrderCond = `(
          /* following blocks */
          block.block_no > ($4)::word31type
        OR (
          /* the same block, following txs,
             or the same tx (because collaterals and outputs follow inputs)
          */
          block.block_no = ($4)::word31type
          AND tx.block_index >= ($6)::word31type
        )
      )`;
    }
  } else if (paginationPoinType === DiffItemType.COLLATERAL) {
    if (diffItemType === DiffItemType.INPUT) {
      linearizedOrderCond = `(
          /* following blocks */
          block.block_no > ($4)::word31type
        OR (
          /* the same block, following txs */
          block.block_no = ($4)::word31type
          AND tx.block_index > ($6)::word31type
        ) /* because collaterals follow input, inputs of the same tx are before the pagination point */
      )`;
    } else if (diffItemType === DiffItemType.COLLATERAL) {
      linearizedOrderCond = `(
          /* following blocks */
          block.block_no > ($4)::word31type
        OR (
          /* the same block, following txs */
          block.block_no = ($4)::word31type
          AND tx.block_index > ($6)::word31type
        ) OR (
          /* the same tx, following collaterals */
          block.block_no = ($4)::word31type
          AND tx.block_index = ($6)::word31type
          AND collateral_tx_in.id > ($5)::integer
        )
      )`;
    } else {
      // diffItemType === DiffItemType.OUTPUT
      linearizedOrderCond = `(
          /* following blocks */
          block.block_no > ($4)::word31type
        OR (
          /* the same block, following txs,
             or the same tx (because outputs follow collaterals)
          */
          block.block_no = ($4)::word31type
          AND tx.block_index >= ($6)::word31type
        )
      )`;
    }
  } else {
    // paginationPoinType === DiffItemType.OUTPUT
    if (
      diffItemType === DiffItemType.INPUT ||
      diffItemType === DiffItemType.COLLATERAL
    ) {
      linearizedOrderCond = `(
          /* following blocks */
          block.block_no > ($4)::word31type
        OR (
          /* the same block, following txs */
          block.block_no = ($4)::word31type
          AND tx.block_index > ($6)::word31type
        ) /* because inputs and collerals follow outputs,
        inputs and collerals of the same tx are before the pagination point */
      )`;
    } else {
      // (diffItemType === DiffItemType.OUTPUT)
      linearizedOrderCond = `(
          /* following blocks */
          block.block_no > ($4)::word31type
        OR (
          /* the same block, following txs */
          block.block_no = ($4)::word31type
          AND tx.block_index > ($6)::word31type
        ) OR (
          /* the same tx, following collaterals */
          block.block_no = ($4)::word31type
          AND tx.block_index = ($6)::word31type
          AND tx_out.index > ($5)::txindex
        )
      )`;
    }
  }

  return `WHERE ${validContract ? "" : "NOT "}tx.valid_contract
    AND block.block_no <= ($3)::word31type
    AND ${linearizedOrderCond}
    AND (
      tx_out.address = any(($1)::varchar array) 
      OR tx_out.payment_cred = any(($2)::bytea array)
    )`;
};

const buildInputQuery = (paginationPoinType: DiffItemType | null) => {
  return `${buildSelectColumns(DiffItemType.INPUT)}
  , encode(src_tx.hash,'hex') as src_hash
  ${buildSelectFromForInputs()}
  ${buildWhereClause(true, DiffItemType.INPUT, paginationPoinType)}`;
};

const buildCollateralQuery = (paginationPoinType: DiffItemType | null) => {
  return `${buildSelectColumns(DiffItemType.COLLATERAL)}
  , encode(src_tx.hash,'hex') as src_hash
  ${buildSelectFromForCollaterals()}
  ${buildWhereClause(false, DiffItemType.COLLATERAL, paginationPoinType)}`;
};

const buildOutputQuery = (paginationPointType: DiffItemType | null) => {
  return `${buildSelectColumns(DiffItemType.OUTPUT)}
  , null as src_hash
  ${buildSelectFromForOutputs()}
  ${buildWhereClause(true, DiffItemType.OUTPUT, paginationPointType)}`;
};

const buildFullQuery = (paginationPoinType: DiffItemType | null) => {
  return `SELECT * FROM (
    ${buildInputQuery(paginationPoinType)}
    UNION ALL
    ${buildCollateralQuery(paginationPoinType)}
    UNION ALL
    ${buildOutputQuery(paginationPoinType)}
  ) as q
  ORDER BY
    q."blockNumber",
    q."blockIndex",
    CASE q."diffItemType" WHEN 'input' THEN 0 WHEN 'collateral' THEN 1  ELSE 2 END,
    q."paginationPointValue"
  LIMIT $${5 + (paginationPoinType != null ? 2 : 0)}::word31type;`;
};

const resolveBestblocksRequest = (pool: Pool) => async (hashes: Array<string> | undefined): Promise<{
  lastFoundSafeblock?: string;
  lastFoundBestblock?: string;
  bestReferencePoint?: { blockHash: string; paginationPointType: null };
}> => {
  if (hashes == null) {
    return {};
  }
  const [safeMatch, bestMatch] = await Promise.all([
    getLatestSafeBlockFromHashes(pool)(hashes),
    getLatestBestBlockFromHashes(pool)(hashes),
  ]);
  if (bestMatch == null) {
    throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
  }
  return {
    lastFoundSafeblock: safeMatch?.hash,
    lastFoundBestblock: bestMatch.hash,
    bestReferencePoint: {
      blockHash: bestMatch.hash,
      paginationPointType: null,
    }
  };
};

export const handleUtxoDiffSincePoint =
  (pool: Pool) => async (req: Request, res: Response) => {
    const { addresses, untilBlockHash, afterPoint: afterPointParam, afterBestblocks, diffLimit } =
      await extractBodyParameters(req.body);

    const untilBlock = await getBlock(pool)(untilBlockHash);
    if (!untilBlock) {
      throw new Error("REFERENCE_BESTBLOCK_NOT_FOUND");
    }

    const { lastFoundSafeblock, lastFoundBestblock, bestReferencePoint } =
      await resolveBestblocksRequest(pool)(afterBestblocks);
    const afterPoint = afterPointParam || bestReferencePoint;
    if (afterPoint == null) {
      throw new Error("error, no `afterPoint` specified and no bestblock matched");
    }

    const afterBlock = await getBlock(pool)(afterPoint.blockHash);
    if (!afterBlock) {
      throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
    }

    const addressTypes = getAddressesByType(addresses);
    const verifiedAddresses = validateAddressesReq(
      addressesRequestLimit,
      addresses
    );

    const fullQuery = buildFullQuery(afterPoint.paginationPointType);

    switch (verifiedAddresses.kind) {
      case "ok": {
        const queryParameters: any[] = [
          [...addressTypes.legacyAddr, ...addressTypes.bech32],
          addressTypes.paymentCreds,
          untilBlock.number,
          afterBlock.number,
        ];

        if (afterPoint.paginationPointType !== null) {
          if (afterPoint.txHash == null) {
            throw new Error("won't happen");
          }
          const afterPointTx = await getTransactionRowByHash(pool)(
            afterPoint.txHash
          );
          if (!afterPointTx) {
            throw new Error("afterPoint.txHash not found");
          }

          queryParameters.push(afterPoint.paginationPointValue);
          queryParameters.push(afterPointTx.blockIndex);
        }

        queryParameters.push(diffLimit);

        const result = await pool.query(fullQuery, queryParameters);

        const apiResponse = {} as any;
        apiResponse.lastFoundSafeblock = lastFoundSafeblock;
        apiResponse.lastFoundBestblock = lastFoundBestblock;

        if (result.rows.length === 0) {
          apiResponse.diffItems = [];
          res.send(apiResponse);
          return;
        }

        const linearized = [];
        for (const row of result.rows) {
          if (
            [DiffItemType.INPUT, DiffItemType.COLLATERAL].includes(
              row.diffItemType
            )
          ) {
            linearized.push({
              type: DiffItemType.INPUT,
              id: `${row.src_hash}:${row.index}`,
              amount: row.value,
            });
          } else {
            linearized.push({
              type: DiffItemType.OUTPUT,
              id: `${row.hash}:${row.index}`,
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
          paginationPointType: lastRow.diffItemType,
          paginationPointValue: lastRow.paginationPointValue,
        };
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
