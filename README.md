# yoroi-graphql-migration-backend.

## Background

The deprecation of Cardano-SL will kill the http-bridge and the old Adalite & EMURGO backend-serivces that power many light wallets and similar applications today.

[Adrestia](https://github.com/input-output-hk/adrestia) is the new codename for all Cardano tooling and includes tooling that will have long-term support.

Adrestia recommends powering light clients with [GraphQL](https://graphql.org/). This is done by using [cardano-db-sync](https://github.com/input-output-hk/cardano-db-sync) to dump the database to a database and then using [cardano-graphql](https://github.com/input-output-hk/cardano-graphql) to serve that data.

## Purpose of this project

This backend allows you to migrate to using cardano-graphql under the hood while maintaining the same API you would have gotten from EMURGO's backend-service V2 API (a "drop-in" replacement). This makes eases the transition to eventually calling GraphQL directly.

# Requirements

To run this, you will need to run the following

1) cardano-node
2) cardano-db-sync
3) cardano-graphql

Notably, we currently test with the following commits:

### cardano-node

Release 1.18.0 should Just Work.  
Follow the building and running instructions from that repository.

### cardano-db-sync.

commit 8c8d133b7451d1e4afcf1836c28b40ea84fd5f99 should Just Work.

the build/run instructions from that repository
at doc/building-running.md should get you up to speed.
Note that you will want to use "extended".

### cardano-graphql

Release 2.0.0 should just work. 

**However**, please node that the docker compose file likely does not have
the exact version of cardano-db-sync needed to run this.  

## Building

Development build (with hot reloading):
```
npm install
npm run dev
```

The server will then run at http://localhost:8082. You can query using curl (ex: `curl http://localhost:8082/bestblock`)

This is no easy way to configure runtime settings. However, you can edit lines 23-26 of src/index.ts to change port settings, graphql uri, et cetera.

## Tests

There are limited test which you can run with `npm run test`.

## API

### `/api/txs/utxoForAddresses`

#### Input

Up to 50 addresses in the request

```js
{
  addresses: Array<string>
}
```

#### Output

```js
Array<{
  utxo_id: string, // concat tx_hash and tx_index
  tx_hash: string,
  tx_index: number,
  receiver: string,
  amount: string
}>;
```

### `/api/getRegistrationHistory`

#### Input

```js
{
  addresses: Array<string> // hex of reward stake addresses
}
```

#### Output

```js
{
  [addresses: string]: Array<Pointer>;
};
type Pointer = null | {|
      slot: number,
      txIndex: number,
      certIndex: number,
      certType: "StakeRegistration"|"StakeDeregistration",
    |};
```

### `/api/getAccountState`

#### Input

```js
{
  addresses: Array<string> // hex of reward stake addresses
}
```

#### Output

```js
{
  [addresses: string]: RewardInfo
};
type RewardInfo = null | {|
      poolOperator: null, // not implemented yet
      remainingAmount: string, // current remaining awards
      rewards: string, //all the rewards every added
      withdrawals: string // all the withdrawals that have ever happened
    |};
```

### `/api/getPoolInfo`

#### Input

```js
{
  poolIds: Array<string> // operator key
};
```

#### Output

```js
{
  [poolId: string]: null | {|
    info: {
      name?: string,
      description?: string,
      ticker?: string,
      ... // other stuff from SMASH.
    },
    history: Array<{|
      epoch: number,
      slot: number,
      tx_ordinal: number
      cert_ordinal: number
      payload: Certificate // see `/api/v2/txs/history`
    |}>
  |}
};
```

this will throw errors for invalid addresses.

### `/api/txs/utxoSumForAddresses`

#### Input

Up to 50 addresses in the request

```js
{
  addresses: Array<string>
}
```

#### Output

```js
{
  sum: ?string
};
```

### `/api/v2/addresses/filterUsed`

#### Input

Up to 50 addresses in the request

```js
{
  addresses: Array<string>
}
```

#### Output

```js
Array<string>
```

### `/api/v2/txs/history`

Since short rollbacks are common (by design) in Cardano Shelley, your app needs to be ready for this. The pagination mechanism should help make this easy for you.

To handle pagination, we use an `after` and `untilBlock` field that refers to positions inside the chain. Usually, pagination works as follows:
1) Query the `bestblock` endpoint to get the current tip of the chain (and call this `untilBlock`)
2) Look up the last transaction your application has saved locally (and call this `after`)
3) Query everything between `untilBlock` and `after`. If `untilBlock` no long exists, requery. If `after` no long exists, mark the transaction as failed and re-query with an earlier transaction
4) If more results were returned than the maximum responses you can receive for one query, find the most recent transction included in the response and set this as the new `after` and then query again (with the same value for `untilBlock`)

**Note**: this endpoint will throw an error if either the `untilBlock` or `after` fields no longer exist inside the blockchain (allowing your app to handle rollbacks). Notably, the error codes are
- 'REFERENCE_BLOCK_MISMATCH'
- 'REFERENCE_TX_NOT_FOUND'
- 'REFERENCE_BEST_BLOCK_MISMATCH'

#### Input

Up to 50 addresses in the request

```js
{
  addresses: Array<string>,
  // omitting "after" means you query starting from the genesis block
  after?: {
    block: string, // block hash
    tx: string, // tx hash
  },
  untilBlock: string, // block hash - inclusive
}
```

#### Output

Up to `50` transactions are returned. Use pagination with the `after` field to get more.

```js
Array<{
  // information that is only present if block is included in the blockchain
  block_num: null | number,
  block_hash: null | string,
  tx_ordinal: null | number,
  time: null | string, // timestamp with timezone
  epoch: null | number,
  slot: null | number,

  // information that is always present
  hash: string,
  last_update: string, // timestamp with timezone
  tx_state: 'Successful' | 'Failed' | 'Pending',
  inputs: Array<{ // these will be ordered by the input transaction id asc
    address: string,
    amount: string,
    id: string, // concatenation of txHash || index
    index: number,
    txHash: string,
  }>,
  outputs: Array<{ //these will be ordered by transaction index asc.
    address: string,
    amount: string,
  }>,
  withdrawals: Array<{| address: string, // hex
    amount: string
  |}>,
  certificates: Array<{|
    kind: 'StakeRegistration',
    rewardAddress:string, //hex
  |} | {|
    kind: 'StakeDeregistration',
    rewardAddress:string, // hex
  |} | {|
    kind: 'StakeDelegation',
    rewardAddress:string, // hex
    poolKeyHash: string, // hex
  |} | {|
    kind: 'PoolRegistration',
    poolParams: {|
      operator: string, // hex
      vrfKeyHash: string, // hex
      pledge: string,
      cost: string,
      margin: number,
      rewardAccount: string, // hex
      poolOwners: Array<string>,  // hex
      relays: Array<{| ipv4: string|null,
        ipv6: string|null,
        dnsName: string|null,
        dnsSrvName: string|null,
        port: string|null |}>,
      poolMetadata: null | {|
        url: string,
        metadataHash: string, //hex
      |},
    |},
  |} | {|
    type: 'PoolRetirement',
    poolKeyHash: string, // hex
    epoch: number,
  |} {|
    type: 'MoveInstantaneousRewardsCert',
    rewards: { [addresses: string]: string } // dictionary of stake addresses to their reward amounts in lovelace
    pot: 0 | 1 // 0 = Reserves, 1 = Treasury
  |}>
}>;
```

### `/api/v2/bestblock`

#### Input

None (GET request)

#### Output

```js
{
  // 0 if no blocks in db
  height: number,
  // null when no blocks in db
  epoch: null | number,
  slot: null | number,
  hash: null | string,
};
```

### `/api/txs/signed`

#### Input

```js
{
  // base64 encoding of the transaction
  signedTx: string,
}
```

#### Output

```js
[]
```

### `/api/status`

This endpoint is used to test whether or not the server can still be reached and get any manually flagged errors.



#### Input

None (GET request)

#### Output

```js
{
  isServerOk: boolean, // heartbeat endpoint for server. IF you want the node status, use /api/v2/importerhealthcheck instead
  isMaintenance: boolean, // manually set and indicates you should disable ADA integration in your app until it returns false. Use to avoid weird app-side behavior during server upgrdes.
}
```

### `/api/v2/importerhealthcheck`

This endpoint is used to check whether or not the underlying node is properly syncing

#### Input

None (GET request)

#### Output

200 status if things look good. Error if node is not syncing

