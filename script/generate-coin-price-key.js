const crypto = require('crypto');
const CardanoWasm = require('@emurgo/cardano-serialization-lib-nodejs');

const bip39PrivateKey = CardanoWasm.Bip32PrivateKey.from_bip39_entropy(
  crypto.randomBytes(160),
  Buffer.from(''),
);

const privateKey = bip39PrivateKey.to_raw_key();
const publicKey = privateKey.to_public();
console.log('private key:', Buffer.from(privateKey.as_bytes()).toString('hex'));
console.log('public key:', Buffer.from(publicKey.as_bytes()).toString('hex'));

