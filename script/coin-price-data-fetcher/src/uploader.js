// @flow
const util = require('util');
const config = require('config');
const AWS = require('aws-sdk');
const logger = require('./logger');

import type { Ticker } from './types';

let _S3 = null;

function getS3() {
  if (_S3) {
    return _S3;
  }

  AWS.config.update({region: config.get("s3.region")});

  _S3 = new AWS.S3({
    accessKeyId: config.get('s3.accessKeyId'),
    secretAccessKey: config.get('s3.secretAccessKey'),
  });

  return _S3;
}

const RETRY_COUNT = 3;

async function upload(ticker: Ticker): Promise<void> {
  const S3 = getS3();
  const fileName = `prices-${ticker.from}-${ticker.timestamp}.json`;
  const uploadParams = {
    Body: JSON.stringify(ticker),
    Key: fileName,
    Bucket: config.get('s3.bucketName'),
  };
  for (let i = 0; i < RETRY_COUNT; i++) {
    let resp;
    if (config.dryRun) {
      logger.info('dry run:', uploadParams);
    } else {
      try {
        resp = await util.promisify(S3.upload.bind(S3))(uploadParams);
      } catch (error) {
        logger.error('upload failed:', error);
        continue;
      }
      logger.info('price data uploaded:', resp);
    }
    break;
  }
}

module.exports = { upload };
