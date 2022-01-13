// @flow
const { PrivateKey, PublicKey } = require("@emurgo/cardano-serialization-lib-nodejs");
/*:: import type { Ticker } from './types'; */

function serializeTicker(ticker/*: Ticker*/)/*: Buffer*/ {
  return Buffer.from(ticker.from +
    ticker.timestamp +
    Object.keys(ticker.prices).sort().map(to => to + ticker.prices[to]).join(''),
    'utf8'
  );
}

function sign(
  obj/*: any*/,
  serializer/*: any => Buffer*/,
  privateKey/*: PrivateKey*/
)/*: string*/ {
  return privateKey.sign(serializer(obj)).to_hex();
}

function verify(
  obj/*: any*/,
  serializer/*: any => Buffer*/,
  signatureHex/*: string*/,
  publicKey/*: PublicKey*/
)/*: boolean*/ {
  return publicKey.verify(
    serializer(obj),
    CardanoWasm.Ed25519Signature.from_bytes(Buffer.from(signatureHex, "hex"))
  );
}

module.exports = { serializeTicker, sign, verify };

if (require.main === module) {
  const config = require('config');

  if (process.argv[2] === 'verify') {
    const ticker = JSON.parse(process.argv[3]);
    const pubKey = PublicKey.from_hex(config.pubKeyData);
    console.log(verify(ticker, serializeTicker, ticker.signature, pubKey));
  } else if (process.argv[2] === 'sign') {
    const ticker = JSON.parse(process.argv[3]);
    const privKey = PrivateKey.from_hex(config.privKeyData);
    console.log(sign(ticker, serializeTicker, privKey));
  } else {
    console.log('node sign.js verify|sign <ticker>');
  }
}
