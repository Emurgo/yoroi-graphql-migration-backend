import { Driver, Integer, Transaction } from "neo4j-driver";
import { Request, Response } from "express";
import { getAddressesByType, mapNeo4jAssets } from "../utils";
import { formatIOAddress, formatNeo4jBigNumber, getPaginationParameters } from "./utils";
import config from "config";
import { BlockFrag } from "../../Transactions/types";

const SAFE_BLOCK_DEPTH = parseInt(config.get("safeBlockDifference"));

enum DiffItemType {
  INPUT = "input",
  COLLATERAL = "collateral",
  OUTPUT = "output",
}

const buildWhereClause = (
  filterBy: ("address" | "payment_cred")[],
  validContract: boolean,
  // for which diff item we are building the where clause
  diffItemType: DiffItemType,
  // the type of pagination point passed in by the client
  paginationPoinType: DiffItemType | null) =>
{
  let linearizedOrderCond;
  if (paginationPoinType === null) {
    linearizedOrderCond = "(b.number > $afterBlock)";
  } else if (paginationPoinType === DiffItemType.INPUT) {
    // the linear order is input < collateral < output
    if (diffItemType === DiffItemType.INPUT) {
      linearizedOrderCond = `(
        b.number > $afterBlock
        OR (
          b.number = $afterBlock
          AND tx.tx_index > $afterTxIndex
        )
        OR (
          b.number = $afterBlock
          AND tx.tx_index = $afterTxIndex
          AND ID(i) > $paginationPointValue
        )
      )`;
    } else {
      // diffItemType === DiffItemType.COLLATERAL || diffItemType === DiffItemType.OUTPUT
      linearizedOrderCond = `(
        b.number > $afterBlock
        OR (
          b.number = $afterBlock
          AND tx.tx_index >= $afterTxIndex
        )
      )`;
    }
  } else if (paginationPoinType === DiffItemType.COLLATERAL) {
    if (diffItemType === DiffItemType.INPUT) {
      linearizedOrderCond = `(
        b.number > $afterBlock
        OR (
          b.number = $afterBlock
          AND tx.tx_index > $afterTxIndex
        )
      )`;
    } else if (diffItemType === DiffItemType.COLLATERAL) {
      linearizedOrderCond = `(
        b.number > $afterBlock
        OR (
          b.number = $afterBlock
          AND tx.tx_index > $afterTxIndex
        )
        OR (
          b.number = $afterBlock
          AND tx.tx_index = $afterTxIndex
          AND ID(c) > $paginationPointValue
        )
      )`;
    } else {
      // diffItemType === DiffItemType.OUTPUT
      linearizedOrderCond = `(
        b.number > $afterBlock
        OR (
          b.number = $afterBlock
          AND tx.tx_index >= $afterTxIndex
        )
      )`;
    }
  } else {
    // paginationPoinType === DiffItemType.OUTPUT
    if (diffItemType === DiffItemType.INPUT || diffItemType === DiffItemType.COLLATERAL) {
      linearizedOrderCond = `(
        b.number > $afterBlock
        OR (
          b.number = $afterBlock
          AND tx.tx_index > $afterTxIndex
        )
      )`;
    } else {
      // diffItemType === DiffItemType.OUTPUT
      linearizedOrderCond = `(
        b.number > $afterBlock
        OR (
          b.number = $afterBlock
          AND tx.tx_index > $afterTxIndex
        )
        OR (
          b.number = $afterBlock
          AND tx.tx_index = $afterTxIndex
          AND o.output_index > $paginationPointValue
        )
      )`;
    }
  }

  const addrFilter = [] as string[];
  if (filterBy.includes("address")) {
    addrFilter.push("o.address IN $addresses");
  }
  if (filterBy.includes("payment_cred")) {
    addrFilter.push("o.payment_cred IN $paymentCreds");
  }
  const addrFilterStr = `${addrFilter.join(" OR ")}`;

  return `WHERE ${validContract ? "" : "NOT "}tx.is_valid
    AND b.number <= $untilBlock
    AND ${linearizedOrderCond}
    AND (
      ${addrFilterStr}
    )
  `;
};

const buildInputQuery = (
  filterBy: ("address" | "payment_cred")[],
  paginationPoinType: DiffItemType | null
) => {
  return `
  MATCH (s_tx:TX)<-[:producedBy]-(o:TX_OUT)-[:sourceOf]
    ->(i:TX_IN)-[:inputOf]
    ->(tx:TX)-[:isAt]
    ->(b:Block)
  ${buildWhereClause(filterBy, true, DiffItemType.INPUT, paginationPoinType)}
  RETURN {
    address: o.address,
    blockHash: b.hash,
    payment_cred: o.payment_cred,
    hash: tx.hash,
    \`index\`: o.output_index,
    value: o.amount,
    blockNumber: b.number,
    blockIndex: tx.tx_index,
    assets: o.assets,
    src_hash: s_tx.hash,
    diffItemType: 'input',
    diffItemTypeInt: 0,
    paginationPointValue: ID(i)
  } as obj
  `;
};

const buildCollateralQuery = (
  filterBy: ("address" | "payment_cred")[],
  paginationPoinType: DiffItemType | null
) => {
  return `
  MATCH (s_tx:TX)<-[:producedBy]-(o:TX_OUT)-[:sourceOf]
    ->(c:COLLATERAL_TX_IN)-[:collateralInputOf]
    ->(tx:TX)-[:isAt]
    ->(b:Block)
  ${buildWhereClause(filterBy, false, DiffItemType.COLLATERAL, paginationPoinType)}
  RETURN {
    address: o.address,
    blockHash: b.hash,
    payment_cred: o.payment_cred,
    hash: tx.hash,
    \`index\`: o.output_index,
    value: o.amount,
    blockNumber: b.number,
    blockIndex: tx.tx_index,
    assets: o.assets,
    src_hash: s_tx.hash,
    diffItemType: 'collateral',
    diffItemTypeInt: 1,
    paginationPointValue: ID(c)
  } as obj
  `;
};

const buildOutputQuery = (
  filterBy: ("address" | "payment_cred")[],
  paginationPoinType: DiffItemType | null
) => {
  return `MATCH (o:TX_OUT)-[:producedBy]->(tx:TX)-[:isAt]->(b:Block)
  ${buildWhereClause(filterBy, true, DiffItemType.OUTPUT, paginationPoinType)}
  RETURN {
    address: o.address,
    blockHash: b.hash,
    payment_cred: o.payment_cred,
    hash: tx.hash,
    \`index\`: o.output_index,
    value: o.amount,
    blockNumber: b.number,
    blockIndex: tx.tx_index,
    assets: o.assets,
    src_hash: null,
    diffItemType: 'output',
    diffItemTypeInt: 2,
    paginationPointValue: o.output_index
  } as obj
  `;
};

const buildFullQuery = (
  filterBy: ("address" | "payment_cred")[],
  paginationPoinType: DiffItemType | null,
) => {
  return `CALL {
    ${buildOutputQuery(filterBy, paginationPoinType)}
    UNION ALL
    ${buildInputQuery(filterBy, paginationPoinType)}
    UNION ALL
    ${buildCollateralQuery(filterBy, paginationPoinType)}
  }
  RETURN obj
  ORDER BY
    obj.blockNumber,
    obj.blockIndex,
    obj.diffItemTypeInt,
    obj.paginationPointValue
  LIMIT $diffLimit`;
};

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

const resolveBestblocksRequest = (transaction: Transaction) => async (hashes: Array<string> | undefined): Promise<{
  lastFoundSafeblock?: string;
  lastFoundBestblock?: string;
  bestReferencePoint?: { blockHash: string; paginationPointType: null };
}> => {
  if (hashes == null) {
    return {};
  }
  const [safeMatch, bestMatch] = await Promise.all([
    getLatestSafeBlockFromHashes(transaction)(hashes),
    getLatestBestBlockFromHashes(transaction)(hashes),
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

export const getLatestBestBlockFromHashes =
  (transaction: Transaction) =>
  async (hashes: Array<string>): Promise<BlockFrag | undefined> => {
    const result = await transaction.run(
      `MATCH (b:Block)
      WHERE b.hash IN $hashes
      
      WITH b
      RETURN b ORDER BY b.number DESC LIMIT 1`, {
        hashes,
      }
    );

    if (!result.records || result.records.length === 0) {
      return undefined;
    }

    const record = result.records[0];

    return {
      epochNo: record.get("b").properties.epoch.toNumber(),
      hash: record.get("b").properties.hash,
      slotNo: record.get("b").properties.slot.toNumber(),
      number: record.get("b").properties.number.toNumber(),
    };
  };

export const getLatestSafeBlockFromHashes =
  (transaction: Transaction) =>
    async (hashes: Array<string>): Promise<BlockFrag | undefined> => {
      const result = await transaction.run(
        `MATCH (bestblock:BESTBLOCK)
        WITH bestblock.number AS bestblockNumber
        
        MATCH (b:Block)
        WHERE b.hash IN $hashes
        WITH b
        
        WHERE b.number <= bestblockNumber - $safeBlockDepth
        RETURN b ORDER BY b.number DESC LIMIT 1`, {
          hashes,
          safeBlockDepth: SAFE_BLOCK_DEPTH
        }
      );

      if (!result.records || result.records.length === 0) {
        return undefined;
      }

      const record = result.records[0];

      return {
        epochNo: record.get("b").properties.epoch.toNumber(),
        hash: record.get("b").properties.hash,
        slotNo: record.get("b").properties.slot.toNumber(),
        number: record.get("b").properties.number.toNumber(),
      };
    };


export const utxoDiffSincePoint = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {
    const { addresses, untilBlockHash, afterPoint: afterPointParam, afterBestblocks, diffLimit } =
      await extractBodyParameters(req.body);
    
    const {
      bech32OrBase58Addresses,
      paymentCreds,
    } = getAddressesByType(addresses);

    const session = driver.session();
    const transaction = session.beginTransaction();

    try {
      const { lastFoundSafeblock, lastFoundBestblock, bestReferencePoint } =
      await resolveBestblocksRequest(transaction)(afterBestblocks);
      const afterPoint = afterPointParam || bestReferencePoint;
      if (afterPoint == null) {
        throw new Error("error, no `afterPoint` specified and no bestblock matched");
      }

      const {
        afterBlock,
        untilBlock,
        afterTxIndex
      } = await getPaginationParameters(transaction)({
        untilBlock: untilBlockHash,
        after: afterPoint ? {
          block: afterPoint.blockHash,
          tx: (afterPoint as any).txHash,
        } : undefined
      });

      const apiResponse = {} as any;
      apiResponse.lastFoundSafeblock = lastFoundSafeblock;
      apiResponse.lastFoundBestblock = lastFoundBestblock;

      if (bech32OrBase58Addresses.length === 0 && paymentCreds.length === 0) {
        apiResponse.diffItems = [];
        return res.send(apiResponse);
      }

      const filterBy = [] as ("address" | "payment_cred")[];
      if (bech32OrBase58Addresses.length > 0) {
        filterBy.push("address");
      }
      if (paymentCreds.length > 0) {
        filterBy.push("payment_cred");
      }

      const query = buildFullQuery(
        filterBy,
        afterPoint.paginationPointType
      );

      const result = await transaction.run(query, {
        addresses: bech32OrBase58Addresses,
        paymentCreds,
        paginationPointValue: afterPoint.paginationPointType ? afterPoint.paginationPointValue : undefined,
        afterBlock,
        untilBlock,
        afterTxIndex: afterTxIndex,
        diffLimit: Integer.fromNumber(diffLimit),
      });

      if (result.records.length === 0) {
        apiResponse.diffItems = [];
        return res.send(apiResponse);
      }

      const linearized = [] as any[];
      for (const record of result.records) {
        const obj = record.get("obj");
        if (
          [DiffItemType.INPUT, DiffItemType.COLLATERAL].includes(
            obj.diffItemType
          )
        ) {
          linearized.push({
            type: DiffItemType.INPUT,
            id: `${obj.src_hash}:${obj.index}`,
            amount: formatNeo4jBigNumber(obj.value),
          });
        } else {
          linearized.push({
            type: DiffItemType.OUTPUT,
            id: `${obj.hash}:${obj.index}`,
            receiver: formatIOAddress(obj.address),
            amount: formatNeo4jBigNumber(obj.value),
            assets: mapNeo4jAssets(obj.assets),
            block_num: obj.blockNumber.toNumber(),
            tx_hash: obj.hash,
            tx_index: obj.index.toNumber(),
          });
        }
      }

      const lastRecord = result.records[result.records.length - 1];
      const lastObj = lastRecord.get("obj");

      apiResponse.lastDiffPointSelected = {
        blockHash: lastObj.blockHash,
        txHash: lastObj.hash,
        paginationPointType: lastObj.diffItemType,
        paginationPointValue: lastObj.paginationPointValue.toNumber().toString(),
      };
      apiResponse.diffItems = linearized;

      return res.send(apiResponse);
    } finally {
      await transaction.rollback();
      await session.close();
    }
  }
});
