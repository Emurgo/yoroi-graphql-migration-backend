import { getSecret } from "docker-secret";

export default { 
  db: {
    user: getSecret("POSTGRES_USER") || process.env.POSTGRES_USER,
    host: getSecret("POSTGRES_HOST") || process.env.POSTGRES_HOST,
    database: getSecret("POSTGRES_DB") || process.env.POSTGRES_DB,
    password: getSecret("POSTGRES_PASSWORD") || process.env.POSTGRES_PASSWORD
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
