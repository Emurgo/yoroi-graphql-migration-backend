export default {
  db: {
    user: process.env.POSTGRES_USER || "",
    host: process.env.POSTGRES_HOST || "/var/run/postgresql",
    database: process.env.POSTGRES_DB || "cexplorer",
    password: process.env.POSTGRES_PASSWORD || "",
  },
  maxTimeHealthCheck: {
    minutes: 3,
    seconds: 10,
  },
  server: {
    addressRequestLimit: 50,
    apiResponseLimit: 50,
    priceFeed: process.env.priceURL || "http://localhost:8090/v1/getPrice",
    tokenInfoFeed:
      process.env.tokenInfoURL || "http://localhost:8091/v1/getTokenInfo",
    txSubmissionEndpoint:
      process.env.TX_SUBMISSION_ENDPOINT ||
      "https://cardano-mainnet.blockfrost.io/api/v0/tx/submit",
    smashEndpoint:
      process.env.SMASH_ENDPOINT ||
      "https://smash.yoroiwallet.com/api/v1/metadata/",
    port: process.env.PORT || 8082,
    txsHashesRequestLimit: 150,
  },
  blockfrostProjectKey: process.env.BLOCKFROST || "",
  milkomeda: {
    minValue: 10000000,
    address: "addr_test1qq6gwl46frfwfk593pqjg39vym476s64n9cmykdl7lv7w32jdqlum6v4sc3l3w9nmuf3ean86n2y7pl83tpxl2qjdw8qmjljz2",
    tokens: [
      {
        name: "ADA",
        policyId: "?"
      },
      {
        name: "TADA",
        policyId: "?"
      },
    ]
  }
};
