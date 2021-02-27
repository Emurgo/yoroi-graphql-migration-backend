import { Pool, } from "pg";

export const createNotifyEpochCreatedSql = `
CREATE OR REPLACE FUNCTION notify_epoch_created() RETURNS TRIGGER AS $$
DECLARE
  new_epoch_values jsonb;
BEGIN
  PERFORM pg_notify(
    'epoch_created',
    json_build_object(
      'epochId', NEW.id::text,
      'outSum', NEW.out_sum::text,
      'fees', NEW.fees::text,
      'txCount', NEW.tx_count,
      'blkCount', NEW.blk_count,
      'epochNo', NEW.no,
      'startTime', NEW.start_time at time zone 'UTC',
      'endTime', NEW.end_time at time zone 'UTC'
    )::text
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
`;

export const createTriggerEpochCreatedSql = `
DROP TRIGGER IF EXISTS on_new_epoch ON epoch;
CREATE TRIGGER on_new_epoch
AFTER INSERT ON epoch
FOR EACH ROW
EXECUTE PROCEDURE notify_epoch_created();
`;

export const createNotifyBlockCreatedSql = `
CREATE OR REPLACE FUNCTION notify_block_created() RETURNS TRIGGER AS $$
DECLARE
  new_block_values jsonb;
BEGIN
  PERFORM pg_notify(
    'block_created',
    json_build_object(
      'blockId', NEW.id::text,
      'hash', encode(NEW.hash, 'hex')::text,
      'epochNo', NEW.epoch_no,
      'blockNo', NEW.block_no::text,
      'slotNo', NEW.slot_no::text,
      'txCount', NEW.tx_count,
      'time', NEW.time at time zone 'UTC'
    )::text
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
`;

export const createTriggerBlockCreatedSql = `
DROP TRIGGER IF EXISTS on_new_block ON block;
CREATE TRIGGER on_new_block
AFTER INSERT ON block
FOR EACH ROW
EXECUTE PROCEDURE notify_block_created();
`;

export const createNotificationTriggers = (pool: Pool): void => {
   { const _ = pool.query(createNotifyEpochCreatedSql); }
   { const _ = pool.query(createTriggerEpochCreatedSql); }
   { const _ = pool.query(createNotifyBlockCreatedSql); }
   { const _ = pool.query(createTriggerBlockCreatedSql); }
};
