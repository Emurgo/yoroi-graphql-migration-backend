export default { 
  db: {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS
  },
  server: {
    addressRequestLimit: 50,
    apiResponseLimit: 50,
    txSubmissionEndpoint: process.env.TX_SUBMISSION_ENDPOINT,
    smashEndpoint: process.env.SMASH_ENDPOINT,
    port: process.env.PORT,
    txsHashesRequestLimit: 150
  }
};
