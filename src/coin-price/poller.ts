// sync the price data from a S3 bucket into DB
import util from "util";
import config from "config";
import AWS from "aws-sdk";
import Logger from "bunyan";
import { Client } from "pg";
import {
  createTickersTable,
  getLatestTicker,
  insertTicker
} from "./db-api";

AWS.config.update({ region: config.get("coinPrice.s3.region") });

const S3 = new AWS.S3({
  accessKeyId: config.get("coinPrice.s3.accessKeyId"),
  secretAccessKey: config.get("coinPrice.s3.secretAccessKey"),
});

const Bucket = config.get("coinPrice.s3.bucketName") as string;

const logger = Logger.createLogger({
  name: "coin-price-poller",
  level: config.get("coinPrice.logLevel"),
});

const CURRENCY = "ADA";

function toObjectKey(currency: string, timestamp: number): string {
  return `prices-${currency}-${timestamp}.json`;
}

const RETRY_COUNT = 3;

async function getTickersFromS3Since(
  // milliseconds after epoch, undefined means start from the beginning (full-sync)
  timestamp: number | undefined,
  currency: string,
  dataCallback: (ticker: Buffer) => Promise<void>,
  errorCallback: () => Promise<void>,
  successCallback: () => Promise<void>
): Promise<void> {
  let continuationToken = undefined;

  for (;;) {
    logger.debug(
      "fetching price data from S3 since",
      timestamp,
      continuationToken
    );
    const listParams: any = {
      Bucket,
      ContinuationToken: continuationToken,
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

  const latestTicker = await getLatestTicker(client, CURRENCY);

  logger.info("start from timestamp", latestTicker?.timestamp);


  await client.query("BEGIN");

  await getTickersFromS3Since(
    latestTicker?.timestamp,
    CURRENCY,
    async (buffer) => {
      const obj = JSON.parse(buffer.toString("binary"));
      logger.debug("got ticker", obj);
      const ticker = {
        from: obj.from,
        timestamp: obj.timestamp,
        signature: obj.signature,
        prices: obj.prices,
      };
      logger.info("insert ticker for", ticker.timestamp);
      await insertTicker(client, ticker);
    },
    async () => {
      await client.query("ROLLBACK");
    },
    async () => {
      await client.query("COMMIT");
    }
  );

  await client.end();
}

try {
  start();
} catch(error) {
  logger.error('poller error', error);
  process.exit(1);
}
