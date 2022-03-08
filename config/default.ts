export default { 
  db: {
    user: process.env.POSTGRES_USER || "hasura",
    host: process.env.POSTGRES_HOST || "/tmp/",
    database: process.env.POSTGRES_DB || "cexplorer",
    password: process.env.POSTGRES_PASSWORD || "",
    port: process.env.POSTGRES_PORT || 5432
  },
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
  sentry: {
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE || "0.01"
  }
};