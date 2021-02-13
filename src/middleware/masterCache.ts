// eslint-disable-next-line
import config from "config";
import {BlockCreatedTrigger} from "../Transactions/types";
import {PoolConfig} from "pg";

// eslint-disable-next-line
const createSubscriber = require('pg-listen');
const cluster = require('cluster');

export const runDBSubscriptionIfMaster = (databaseLogin: PoolConfig, cacheActive: Boolean): void => {
    if (!cacheActive || !cluster.isMaster) return;

    // Database Subscriptions
    const subscriber = createSubscriber(
        { user: config.get("db.user")
            , host: config.get("db.host")
            , database: config.get("db.database")
            , password: config.get("db.password")}
    );

    subscriber.notifications.on('block_created', (block: BlockCreatedTrigger) => {
        if(Object.values(block).some(e => (e == null))) {
            console.log("block_created::trigger has a null value ", block);
            return;
        }

    });

    subscriber.notifications.on('epoch_created', (epoch: any) => {
        if(Object.values(epoch).some(e => (e == null))) {
            console.log("epoch_created::trigger has a null value ", epoch);
            return;
        }

    });

    (async () => {
        await subscriber.connect();
        await subscriber.listenTo('block_created');
    })();
}

const processBlockForCache = (block: BlockCreatedTrigger): void => {
    // endpoints to invalidate cache
    // bestblock
    // txHistory
    // accountState
}