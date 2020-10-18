# yoroi-graphql-migration-backend

## Background

[Adrestia](https://github.com/input-output-hk/adrestia) is the new codename for all Cardano tooling and includes tooling that will have long-term support.

Adrestia recommends powering light clients with [GraphQL](https://graphql.org/). This is done by using [cardano-db-sync](https://github.com/input-output-hk/cardano-db-sync) to dump the database to a database and then using [cardano-graphql](https://github.com/input-output-hk/cardano-graphql) to serve that data.

## Purpose of this project

This provides an API useful to light wallets for Cardano.

For some endpoints, we use SQL queries directly (either because they aren't possible in GraphQL or because we need the performance of raw SQL queries)

However, we initially wanted every query to be in GraphQL so that any project using yoroi-graphql-migration-backend can use our REST API as a intermediate step to running GraphQL queries directly.

# Requirements

To run this, you will need to run the following

1) cardano-node
2) cardano-db-sync
3) cardano-graphql

## Building

Development build (with hot reloading):
```bash
# install the right version of Node
nvm use
nvm install

# install dependencies
npm install

# run the server
npm run dev
```

The server will then run at http://localhost:8082. You can query using curl (ex: `curl http://localhost:8082/bestblock`)

This is no easy way to configure runtime settings. However, you can edit lines 23-26 of src/index.ts to change port settings, graphql uri, et cetera.

## Tests

There are test which run by querying your local cardano-db-sync and cardano-graphql. You can run it by doing the following
```bash
# run the server on a terminal window
npm run dev

# run the tests on a different terminal
npm run test
```

## API

<details>
  <summary>api/txs/utxoForAddresses</summary>
  Input

  Up to 50 addresses in the request

  ```js
  {
    // bech32 address for strict match. hex-encoded address for matching on the payment key
    addresses: Array<string>
  }
  ```

  Output

  ```js
  Array<{
    utxo_id: string, // concat tx_hash and tx_index
    tx_hash: string,
    tx_index: number,
    block_num: number, // NOTE: not slot_no
    receiver: string,
    amount: string
  }>
  ```
</details>
<details>
  <summary>api/getRegistrationHistory</summary>
  Input

  ```js
  {
    addresses: Array<string> // hex of reward stake addresses
  }
  ```

  Output

  ```js
  {
    [addresses: string]: Array<{|
      slot: number,
      txIndex: number,
      certIndex: number,
      certType: "StakeRegistration"|"StakeDeregistration",
    |}>
  }
  ```
</details>
<details>
  <summary>api/getAccountState</summary>
  Input

  ```js
  {
    addresses: Array<string> // hex of reward stake addresses
  }
  ```

  Output

  ```js
  {
    [addresses: string]: null | {|
      poolOperator: null, // not implemented yet
      remainingAmount: string, // current remaining awards
      rewards: string, //all the rewards every added (not implemented yet)
      withdrawals: string // all the withdrawals that have ever happened (not implemented yet)
    |}
  }
  ```
</details>
<details>
  <summary>api/getRewardHistory</summary>
  Input

  ```js
  {
    addresses: Array<string> // hex of reward stake addresses
  }
  ```

  Output

  ```js
  {
    [addresses: string]: Array<{
      epoch: number,
      reward: string,
    }>
  }
  ```
</details>
<details>
  <summary>api/getPoolInfo</summary>
  Input

  ```js
  {
    poolIds: Array<string> // operator key
  }
  ```

  Output

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
  }
</details>
<details>
  <summary>api/txs/utxoSumForAddresses</summary>
  Input

  Up to 50 addresses in the request

  ```js
  {
    addresses: Array<string>
  }
  ```

  Output

  ```js
  {
    sum: ?string
  }
  ```
</details>
<details>
  <summary>api/v2/addresses/filterUsed</summary>
  Input

  Up to 50 addresses in the request

  ```js
  {
    // bech32 address for strict match. hex-encoded address for matching on the payment key
    addresses: Array<string>
  }
  ```

  Output

  ```js
  Array<string>
  ```
</details>
<details>
  <summary>api/v2/txs/history</summary>
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

  Input

  Up to 50 addresses in the request

  ```js
  {
    // addresses may contain several different things.
    // 1. For reward addresses, this field accepts the hex (as a string)
    // 2. Bech32 addresses will strictly match the address passed in
    // 3. hex-encoded addresses will match on any address with the same payment key
    // 4. For Byron, use the Ae2/Dd address.
    addresses: Array<string>,
    // omitting "after" means you query starting from the genesis block
    after?: {
      block: string, // block hash
      tx: string, // tx hash
    },
    untilBlock: string, // block hash - inclusive
  }
  ```

  Output

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
    type: 'byron' | 'shelley',
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
  }>
  ```
</details>
<details>
  <summary>api/v2/bestblock</summary>
  Input

  None (GET request)

  Output

  ```js
  {
    // 0 if no blocks in db
    height: number,
    // null when no blocks in db
    epoch: null | number,
    slot: null | number,
    hash: null | string,
  }
  ```
</details>
<details>
  <summary>api/txs/signed</summary>
  Input

  ```js
  {
    // base64 encoding of the transaction
    signedTx: string,
  }
  ```

  Output

  ```js
  []
  ```
</details>
<details>
  <summary>api/status</summary>

  This endpoint is used to test whether or not the server can still be reached and get any manually flagged errors.

  Input

  None (GET request)

  Output

  ```js
  {
    isServerOk: boolean, // heartbeat endpoint for server. IF you want the node status, use /api/v2/importerhealthcheck instead
    isMaintenance: boolean, // manually set and indicates you should disable ADA integration in your app until it returns false. Use to avoid weird app-side behavior during server upgrades.
    serverTime: number, // in millisecond unix time
  }
  ```
</details>
<details>
  <summary>api/v2/importerhealthcheck</summary>
  This endpoint is used to check whether or not the underlying node is properly syncing

  Input

  None (GET request)

  Output

  200 status if things look good. Error if node is not syncing


</details>
