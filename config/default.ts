export default { 
  db: {
    user: process.env.dbUser,
    host: process.env.dbHost,
    database: process.env.db,
    password: process.env.dbPass
  },
  server: {
    addressRequestLimit: 50,
    apiResponseLimit: 50,
    txSubmissionEndpoint: process.env.txSubmissionEndpoint,
    smashEndpoint: process.env.smashEndpoint,
    port: process.env.port,
    txsHashesRequestLimit: 150
  }
};
