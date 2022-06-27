// sync the price data from a S3 bucket into DB
import util from "util";
import config from "config";
import AWS from "aws-sdk";
import Logger from "bunyan";
import { Client } from "pg";
import { createTickersTable, getLatestTicker, insertTicker } from "./db-api";

const RETRY_COUNT = 3;
const CURRENCIES = ["ADA", "ERG"];

let _S3: AWS.S3 | void;
let _Bucket: string | void;
let _logger: Logger | void;

function getS3(): AWS.S3 {
  if (_S3 == null) {
    throw new Error("S3 is not initialised");
  }
  return _S3;
}

function getBucket(): string {
  if (_Bucket == null) {
    throw new Error("Bucket is not initialised");
  }
  return _Bucket;
}

function getLogger(): Logger {
  if (_logger == null) {
    throw new Error("Logger is not initialised");
  }
  return _logger;
}

function toPrefix(currency: string): string {
  return `prices-${currency}`;
}
function toObjectKey(currency: string, timestamp: number): string {
  return `prices-${currency}-${timestamp}.json`;
}

async function getTickersFromS3Since(
  // milliseconds after epoch, undefined means start from the beginning (full-sync)
  timestamp: number | undefined,
  currency: string,
  dataCallback: (ticker: Buffer) => Promise<void>,
  errorCallback: () => Promise<void>,
  successCallback: () => Promise<void>,
  logger: Logger
): Promise<void> {
  let continuationToken = undefined;
  const S3 = getS3();
  const Bucket = getBucket();
  for (;;) {
    logger.debug(
      "fetching price data from S3 since",
      timestamp,
      continuationToken
    );
    const listParams: any = {
      Bucket,
      ContinuationToken: continuationToken,
      Prefix: toPrefix(currency),
      StartAfter: timestamp ? toObjectKey(currency, timestamp) : undefined,
    };
    let resp;
    for (let i = 0; i < RETRY_COUNT; i++) {
      try {
        // eslint-disable-next-line
        // @ts-expect-error: TypeScript can't get `util.promisify` straight
        resp = await util.promisify(S3.listObjectsV2.bind(S3))(listParams);
        break;
      } catch (error) {
        logger.debug(`getting object list attempt ${i} failed`, error);
      }
    }
    if (!resp) {
      logger.error("getting object list failed");
      await errorCallback();
      return;
    }
    logger.info(`there are ${resp.Contents?.length} objects`);

    for (const { Key } of resp.Contents ?? []) {
      logger.info(`getting ${Key}`);

      let resp;
      for (let i = 0; i < RETRY_COUNT; i++) {
        try {
          // eslint-disable-next-line
          // @ts-expect-error: TypeScript can't get `util.promisify` straight
          resp = await util.promisify(S3.getObject.bind(S3))({ Bucket, Key });
          break;
        } catch (error) {
          logger.debug(`getting object attempt ${i} failed`, error);
        }
      }
      if (!resp || !(resp.Body instanceof Buffer)) {
        logger.error("getting object failed");
        await errorCallback();
        return;
      }

      await dataCallback(resp.Body);
    }

    continuationToken = resp.NextContinuationToken;
    if (!continuationToken) {
      break;
    }
  }
  await successCallback();
}

export async function start() {
  const S3 = getS3();
  const Bucket = getBucket();
  const logger = getLogger();

  // do nothing if there isn't a flag file present in the S3 bucket
  try {
    await util.promisify(S3.getObject.bind(S3))(
      // eslint-disable-next-line
      // @ts-expect-error: TypeScript can't get `util.promisify` straight
      { Bucket, Key: "__BEGIN_FLAG" }
    );
  } catch (error: any) {
    if (error.message === "The specified key does not exist.") {
      logger.info("no begin flag");
      return;
    }
  }

  const client = new Client({
    user: config.get("db.user"),
    host: config.get("db.host"),
    database: config.get("db.database"),
    password: config.get("db.password"),
    port: config.get("db.port"),
  });
  await client.connect();

  try {
    await createTickersTable(client);
    logger.info("created table");
  } catch {
    logger.info("table exists");
  }

  for (const currency of CURRENCIES) {
    const curlogger = logger.child({ currency });
    const latestTicker = await getLatestTicker(client, currency);

    curlogger.info("start from timestamp", latestTicker?.timestamp);

    await client.query("BEGIN");

    await getTickersFromS3Since(
      latestTicker?.timestamp,
      currency,
      async (buffer) => {
        const obj = JSON.parse(buffer.toString("binary"));
        curlogger.debug("got ticker", obj);
        const ticker = {
          from: obj.from,
          timestamp: obj.timestamp,
          signature: obj.signature,
          prices: obj.prices,
        };
        curlogger.info("insert ticker for", ticker.timestamp);
        await insertTicker(client, ticker);
      },
      async () => {
        await client.query("ROLLBACK");
      },
      async () => {
        curlogger.info("commit");
        await client.query("COMMIT");
      },
      curlogger
    );
  }
  await client.end();
}

if (process.env.RUN_POLLER === "true") {
  AWS.config.update({ region: config.get("coinPrice.s3.region") });
  _S3 = new AWS.S3({
    accessKeyId: config.get("coinPrice.s3.accessKeyId"),
    secretAccessKey: config.get("coinPrice.s3.secretAccessKey"),
  });
  _Bucket = config.get("coinPrice.s3.bucketName") as string;
  _logger = Logger.createLogger({
    name: "coin-price-poller",
    level: config.get("coinPrice.logLevel"),
  });

  try {
    start();
  } catch (error) {
    _logger.error("poller error", error);
    process.exit(1);
  }
}
