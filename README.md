# yoroi-graphql-migration-backend.

Purpose: 
1) As we move from Byron to Shelly we will be adopting a host of new tools.
   Not all of those tools support reading Byron transaction bodies. 
   This repository will (eventually) support reading them from 
   cardano-graphql and cardano-db-sync.
2) Numerous third-party tools are using the existing yoroi-backend-service,
   but that itself may be replaced by some of the aforementioned tooling
   (particularly cardano-graphql.) 
   This repository can serve as a drop-in replacement for 
   yoroi-backend-service for api endpoints that can be served by graphql,
   which can help migration.
3) Those same third-party tools often have to replicate significant
   blockchain logic within their testing suite.
   This repository will (eventually) have a moched-blockchain to allow
   for easier integration tests.

## Building

At present, there is only "development build".  
A typescript compiler will automatically watch, recompile, and reload
running code.
You can do this easily with 

```
npm install
npm run dev
```

The server will then run at http://localhost:8082.
`curl http://localhost:8082/bestblock` should respond with something
interesting.

This is no easy way to configure runtime settings, however.
You can edit lines 23-26 of src/index.ts to change port settings, 
graphql uri, et cetera.

## Runtime requirements

You will quickly notice after `npm run dev` and `curl ...` that things
do not actually work.  
You will likely need a chain of executables to use this.
As of the time of writing (26 Jun 2020) these runtime requirements are
tied to specific git commits. 
They are
1) cardano-node.
2) cardano-db-sync.
3) cardano-graphql.

Technically speaking, you only need the last one together with a postgresql
copy of the blockchain and (3).  
But it's probably easier to set them all up.
Details about the specific git commits below.

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

## Tests

There are limited test which you can run with `npm run test`.

## TODO

 - [ ] all the code is in index.js, which is a bit silly.
 - [ ] inconsistent graphql functions.  The style for `askTransactionHistory`
       is superior, your author intends for the other ones to also specify
       their return type and return errors rather than raise exceptions.
 - [ ] Many api endpoints are missing, especially those for submitting 
       transactions and healthchecks.
 - [ ] the tests only check to see that the response is an object.  It does not
       test to ensure that each api is giving the specified response.
 - [ ] Further to the above, there does not seem to exist an API specification, 
       or at least your author cannot find it.
 - [ ] Logging, configuration, production builds.
 - [ ] error handling. 

Good luck!
