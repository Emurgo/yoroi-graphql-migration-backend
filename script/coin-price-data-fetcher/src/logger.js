//@flow
const bunyan = require('bunyan');
const config = require('config');
const logger = bunyan.createLogger({name: 'price data fetcher', level: config.logger.level});

module.exports = logger;
