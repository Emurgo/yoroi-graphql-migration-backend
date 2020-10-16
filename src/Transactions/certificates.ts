import { Pool, } from "pg";

export const createViewSql = `
drop view if exists combined_certificates;
create view combined_certificates as
select 'StakeRegistration' as "jsType"
     , 'CertRegKey' as "formalType"
     , reg.tx_id as "txId"
     , reg.cert_index as "certIndex"
     , encode(addr.hash_raw,'hex') as "stakeCred"
     , null::text as "poolHashKey"
     , null::text as "poolParamsOperator"
     , null::text as "poolParamsVrfKeyHash"
     , null::numeric as "poolParamsPledge"
     , null::bigint as "poolParamsCost"
     , null::double precision as "poolParamsMargin"
     , null::text as "poolParamsRewardAccount"
     , null::json as "poolParamsOwners"
     , null::json as "poolParamsRelays"
     , null as "poolParamsMetaDataUrl"
     , null::text as "poolParamsMetaDataHash"
     , null::integer as "epoch"
     , null as "mirPot"
     , null::json as "rewards"
from stake_registration as reg
join stake_address as addr 
  on reg.addr_id = addr.id

UNION ALL
  
select 'StakeDeregistration' as "jsType"
     , 'CertDeregKey' as "formalType"
     , dereg.tx_id as "txId"
     , dereg.cert_index as "certIndex"
     , encode(addr.hash_raw,'hex') as "stakeCred"
     , null::text as "poolHashKey"
     , null::text as "poolParamsOperator"
     , null::text as "poolParamsVrfKeyHash"
     , null::numeric as "poolParamsPledge"
     , null::bigint as "poolParamsCost"
     , null::double precision as "poolParamsMargin"
     , null::text as "poolParamsRewardAccount"
     , null::json as "poolParamsOwners"
     , null::json as "poolParamsRelays"
     , null as "poolParamsMetaDataUrl"
     , null::text as "poolParamsMetaDataHash"
     , null::integer as "epoch"
     , null as "mirPot"
     , null::json as "rewards"
from stake_deregistration as dereg
join stake_address as addr
  on dereg.addr_id = addr.id

UNION ALL
  
select 'StakeDelegation' as "jsType"
     , 'CertDelegate' as "formalType"
     , del.tx_id as "txId"
     , del.cert_index as "certIndex"
     , encode(addr.hash_raw,'hex') as "stakeCred"
     , encode(pool_hash.hash_raw, 'hex') as "poolHashKey"
     , null::text as "poolParamsOperator"
     , null::text as "poolParamsVrfKeyHash"
     , null::numeric as "poolParamsPledge"
     , null::bigint as "poolParamsCost"
     , null::double precision as "poolParamsMargin"
     , null::text as "poolParamsRewardAccount"
     , null::json as "poolParamsOwners"
     , null::json as "poolParamsRelays"
     , null as "poolParamsMetaDataUrl"
     , null::text as "poolParamsMetaDataHash"
     , null::integer as "epoch"
     , null as "mirPot"
     , null::json as "rewards"
from delegation as del
join stake_address as addr
  on del.addr_id = addr.id
join pool_hash
  on del.pool_hash_id = pool_hash.id

UNION ALL
  
select 'PoolRegistration' as "jsType"
     , 'CertRegPool' as "formalType"
     , pool.registered_tx_id as "txId" 
     , pool.cert_index as "certIndex"
     , null as "stakeCred"
     , encode(pool_hash.hash_raw,'hex') as "poolHashKey"
     , encode(pool_hash.hash_raw,'hex') as "poolParamsOperator" 
           -- this is weird.  a hash of pool operator (see pg 30 of A Formal 
           -- Spec of the Cardano Ledger) can be acquired by the cwitness 
           -- accessor.  it also says (pg 37) that the stake pool is identified
           -- with the hashkey of the pool operator. looking through Insert.hs,
           -- it is clear that there is a hash that's identified with the stake
           -- pool.  it is this one!
     , encode(pool.vrf_key,'hex') as "poolParamsVrfKeyHash"
     , pool.pledge as "poolParamsPledge"
     , pool.fixed_cost as "poolParamsCost"
     , pool.margin as "poolParamsMargin"
     , encode(addr.hash_raw,'hex') as "poolParamsRewardAccount"
     , ( select json_agg(encode(hash,'hex'))
         from pool_owner
         where pool_owner.pool_hash_id = pool_hash.id) as "poolParamsOwners"
     , ( select json_agg(json_build_object( 'ipv4',       ipv4
     					  , 'ipv6',       ipv6
     					  , 'dnsName',    dns_name
     					  , 'dnsSrvName', dns_srv_name
     					  , 'port',       port)) 
         from pool_relay
         where pool_relay.update_id = pool.id) as "poolParamsRelays"
     , pool_meta.url as "poolParamsMetaDataUrl"
     , encode(pool_meta.hash,'hex') as "poolParamsMetaDataHash"
     , null::integer as "epoch"
     , null as "mirPot"
     , null::json as "rewards"
from pool_update as pool
join pool_hash
  on pool.hash_id = pool_hash.id
join stake_address as addr
  on addr.id = pool.reward_addr_id
left join pool_meta_data as pool_meta
  on pool_meta.id = pool.meta

UNION ALL
  
select 'PoolRetirement' as "jsType"
     , 'CertRetirePool' as "formalType"
     , pool.announced_tx_id as "txId"
     , pool.cert_index as "certIndex"
     , null as "stakeCred"
     , encode(pool_hash.hash_raw, 'hex') as "poolHashKey"
     , null::text as "poolParamsOperator"
     , null::text as "poolParamsVrfKeyHash"
     , null::numeric as "poolParamsPledge"
     , null::bigint as "poolParamsCost"
     , null::double precision as "poolParamsMargin"
     , null::text as "poolParamsRewardAccount"
     , null::json as "poolParamsOwners"
     , null::json as "poolParamsRelays"
     , null as "poolParamsMetaDataUrl"
     , null::text as "poolParamsMetaDataHash"
     , pool.retiring_epoch as "epoch"
     , null as "mirPot"
     , null::json as "rewards"
from pool_retire as pool
join pool_hash 
  on pool_hash.id = pool.hash_id

UNION ALL
  
select 'MoveInstantaneousRewardsCert' as "jsType"
     , 'CertMir' as "formalType"
     , reserve.tx_id as "txId"
     , max(reserve.cert_index) as "certIndex"  
     , null as "stakeCred"
     , null::text as "poolHashKey"
     , null::text as "poolParamsOperator"
     , null::text as "poolParamsVrfKeyHash"
     , null::numeric as "poolParamsPledge"
     , null::bigint as "poolParamsCost"
     , null::double precision as "poolParamsMargin"
     , null::text as "poolParamsRewardAccount"
     , null::json as "poolParamsOwners"
     , null::json as "poolParamsRelays"
     , null as "poolParamsMetaDataUrl"
     , null::text as "poolParamsMetaDataHash"
     , null::integer as "epoch"
     , 'Reserves' as "mirPot"
     , json_agg((encode(addr.hash_raw,'hex'), reserve.amount)) as "rewards"
from reserve
join stake_address as addr
  on addr.id = reserve.addr_id
group by reserve.tx_id      

UNION ALL

select 'MoveInstantaneousRewardsCert' as "jsType"
     , 'CertMir' as "formalType"
     , treasury.tx_id as "txId"
     , max(treasury.cert_index) as "certIndex"  
     , null as "stakeCred"
     , null::text as "poolHashKey"
     , null::text as "poolParamsOperator"
     , null::text as "poolParamsVrfKeyHash"
     , null::numeric as "poolParamsPledge"
     , null::bigint as "poolParamsCost"
     , null::double precision as "poolParamsMargin"
     , null::text as "poolParamsRewardAccount"
     , null::json as "poolParamsOwners"
     , null::json as "poolParamsRelays"
     , null as "poolParamsMetaDataUrl"
     , null::text as "poolParamsMetaDataHash"
     , null::integer as "epoch"
     , 'Treasury' as "mirPot"
     , json_agg((encode(addr.hash_raw,'hex'), treasury.amount)) as "rewards"
from treasury
join stake_address as addr
  on addr.id = treasury.addr_id
group by treasury.tx_id;
;`;

export const createCertificatesView = (pool: Pool): void => {
  pool.query(createViewSql);
};
