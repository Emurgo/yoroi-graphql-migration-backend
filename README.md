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

commit 7eb060098d1124e879a0472a6ef00f1ff3ff0a02 should Just Work.  
Follow the building and running instructions from that repository.

### cardano-db-sync.

commit bf1b61be25802b69191ac3de04ed377a972cc809 should Just Work.
Later commits are unlikely to work with cardano-node.
As of the time of writing (26 Jun 2020) this repo is in a state of flux.

If you want to use transaction bodies, as discussed in the purpose,
you may be interested in using this pr:
https://github.com/mebassett/cardano-db-sync/pull/1

In either case, the build/run instructions from that repository
at doc/building-running.md should get you up to speed.
Note that you will want to use "extended".

### cardano-graphql

This is the trickiest.
This repository has a docker-compose file that your author was never able to get
running.
Worse, we require some specific commits (because the graphql schema neglects to
define key relationships) whose images are not yet in docker hub.

You will want to use this PR:
https://github.com/input-output-hk/cardano-graphql/pull/195

**However**, even this PR is tricky.  
There are two executables here:
a) Hasura
b) cardano-graphql node app.

To run (a) you will need to:
- edit hasura/docker-entrypoint.sh so that HASURA_GRAPHQL_DATABASE_URL points to
  the same postgresql database that cardano-db-sync is running on.
  (you can have this running in docker or your local machine.  My instructions
   assume postgresql is running locally and not in docker) 
- build a new docker image with
    ```
        cd hasura/
        docker build . -t custom-cardano-graphql-hasura
    ```
- launch with
    ```
    docker run -i --net=host \
      -e HASURA_GRAPHQL_ENABLED_LOG_TYPES='startup, http-log, webhook-log, websocket-log, query-log' \
      -e HASURA_GRAPHQL_ENABLE_TELEMETRY=false \
      -e HASURA_GRAPHQL_ENABLE_CONSOLE=true \
      custom-cardano-graphql-hasura
    ```
  Note that I am using `--net=host`, which should make it easier for hasura to
  talk to your local postgresql service (ensure that you are allowing tcp 
  connections over 127.0.0.1 or whatever you have set in earlier steps!)
  This also means that hasura will try to take port 8080.
  I have found that cardano-db-sync also uses this port, but doesn't need it.
  (I have not investigated this further.  But cardano-db-sync doesn't seem
   to cp
  So, naively, you would think you would want run hasura first.
  But cardano-db-sync builds the database schema that hasura is expecting to
  find.
  So you may need to start cardano-db-sync first, then kill it, then
  start hasura, or something hacky like that.
  It is fragile.

  To verify that it is running, you should see the hasura console at
  http://localhost:8080.

Running (b) is much easier.  From the repostory root directory, simply run:
 - `yarn && yarn build`
 - `cd dist/`
 - `HASURA_URI=http://localhost:8080 node index.js`

 To verify that it is running, you should see a graphql console at
 http://localhost:3100

Assuming hasura and cardano-graphql are all running properly, with a populated
database, this repo should respond to requests at http://localhost:8082.

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

### `/api/txs/txBodies`

#### Input

```js
{
  txsHashes: Array<string>
}
```

#### Output

```js
{
  [key: string]: string
};
```

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

## TODO

 - [ ] inconsistent graphql functions. The style for `askTransactionHistory` is superior, your author intends for the other ones to also specify their return type and return errors rather than raise exceptions.
 - [ ] Many api endpoints are missing, especially those for submitting transactions and healthchecks.
 - [ ] some tests only check to see that the response is an object. It does not test to ensure that each api is giving the specified response.
 - [ ] Logging, configuration, production builds.
 - [ ] error handling.
