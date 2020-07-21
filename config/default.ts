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
    port: 8082,
    txsHashesRequestLimit: 150
  }
}
