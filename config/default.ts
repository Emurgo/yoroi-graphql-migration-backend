import { secrets } from "docker-secret";

export default { 
  db: {
    user: secrets.postgres_user || process.env.POSTGRES_USER,
    host: secrets.postgres_host || process.env.POSTGRES_HOST,
    database: secrets.postgres_db || process.env.POSTGRES_DB,
    password: secrets.postgres_password || process.env.POSTGRES_PASSWORD
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
