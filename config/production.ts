export default { 
  db: {
    user: 'csyncdb',
    host: '/run/postgresql',
    database: 'csyncdb',
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
