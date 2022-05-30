export default { 
  db: {
    user: process.env.POSTGRES_USER || "hasura",
    host: process.env.POSTGRES_HOST || "/tmp/",
    database: process.env.POSTGRES_DB || "cexplorer",
    password: process.env.POSTGRES_PASSWORD || "",
    port: process.env.POSTGRES_PORT || 5432
  },
  yoroiDb: {
    user: process.env.YOROI_POSTGRES_USER || "",
    host: process.env.YOROI_POSTGRES_HOST || "",
    database: process.env.YOROI_POSTGRES_DB || "",
    password: process.env.YOROI_POSTGRES_PASSWORD || "",
    port: process.env.YOROI_POSTGRES_PORT || 0
  },
  useYoroiDb: process.env.USE_YOROI_DB || "false",
  server: {
    addressRequestLimit: 50,
    apiResponseLimit: 50,
    txSubmissionEndpoint: process.env.TX_SUBMISSION_ENDPOINT || "https://backend.yoroiwallet.com/api/submit/tx",
    signedTxQueueEndpoint: process.env.SIGNED_TX_QUEUE_ENDPOINT || "http://localhost:3030/",
    smashEndpoint: process.env.SMASH_ENDPOINT || "https://smash.yoroiwallet.com/api/v1/metadata/",
    port: process.env.PORT || 8082,
    txsHashesRequestLimit: 150,
  },
  safeBlockDifference: process.env.SAFE_BLOCK_DIFFERENCE || "10",
  usingQueueEndpoint: process.env.USE_SIGNED_TX_QUEUE || "false",
  aws: {
    lambda: {
      nftValidator: "{envName}NftValidatorLambda"
    },
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    region: process.env.AWS_REGION || "eu-central-1"
  },
  postgresOptions: {
    workMem: process.env.WORK_MEM || "'2GB'",
    maxParallelWorkers: process.env.MAX_PARALLEL_WORKERS || "12"
  },
  coinPrice: {
    currentPriceHttpCacheControlMaxAge: 60, // which is the price data refresh interval
    logLevel: "info",
    s3: {
      region: process.env.PRICE_DATA_S3_REGION,
      bucketName: process.env.PRICE_DATA_S3_BUCKET_NAME,
      accessKeyId: process.env.PRICE_DATA_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.PRICE_DATA_S3_SECRET_ACCESS_KEY,
    },
  }
};