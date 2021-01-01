export default { 
  db: {
    user: 'hasura',
    host: '/tmp/',
    database: 'cexplorer',
    password: ''
  },
  server: {
    addressRequestLimit: 50,
    apiResponseLimit: 50,
    txSubmissionEndpoint: 'https://backend.yoroiwallet.com/api/submit/tx',
    smashEndpoint: 'https://smash.yoroiwallet.com/api/v1/metadata/',
    port: 8082,
    txsHashesRequestLimit: 150
  }
}
