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
    graphqlEndpoint: 'http://localhost:3100/',
    txSubmissionEndpoint: 'https://backend.yoroiwallet.com/api/submit/tx',
    smashEndpoint: 'https://stage-smash.yoroiwallet.com/api/v1/metadata/',
    port: 8082,
    txsHashesRequestLimit: 150
  }
}
