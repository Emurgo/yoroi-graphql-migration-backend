import { Integer, Session } from "neo4j-driver";
import { Request, Response } from "express";
import {
  Ed25519KeyHash,
  NetworkInfo,
  RewardAddress,
  StakeCredential
} from "@emurgo/cardano-serialization-lib-nodejs";
import config from "config";
import { Driver } from "neo4j-driver-core";
import { getAddressesByType, mapNeo4jAssets } from "../utils";

const GENESIS_UNIX_TIMESTAMP = 1506243091;
const SHELLEY_UNIX_TIMESTAMP = 1596491091;
const SHELLEY_INITIAL_SLOT = 4924800;
const BYRON_SLOT_DURATION_IN_SECONDS = 20;

const blockDate = (block: Neo4jModel.Block) => {
  return block.era === "Byron"
  ? byronDateFromSlot(neo4jBigNumberAsNumber(block.slot))
  : shelleyDateFromSlot(neo4jBigNumberAsNumber(block.slot));
};

const byronDateFromSlot = (slot: number) => {
  const unix = GENESIS_UNIX_TIMESTAMP + (slot * BYRON_SLOT_DURATION_IN_SECONDS);
  return new Date(unix * 1000);
};

const shelleyDateFromSlot = (slot: number) => {
  const unix = SHELLEY_UNIX_TIMESTAMP + (slot - SHELLEY_INITIAL_SLOT);
  return new Date(unix * 1000);
};

const getScriptsSize = (scripts: Neo4jModel.SCRIPT[]) => {
  return scripts.reduce((prev, curr) => {
    const size = curr.script_hex
      ? Buffer.from(curr.script_hex, "hex").length
      : 0;
    return prev + size;
  }, 0);
};

const getReceivedCypherPart = (addresses: string[], paymentCreds: string[]) => {
  if (addresses.length === 0 && paymentCreds.length === 0) return "";

  const whereClause = addresses.length !== 0 && paymentCreds.length !== 0
    ? "WHERE o.payment_cred IN $payment_creds OR o.address IN $addresses"
    : addresses.length !== 0
      ? "WHERE o.address IN $addresses"
      : "WHERE o.payment_cred IN $payment_creds";

  return `MATCH (o:TX_OUT)
${whereClause}
MATCH (o)-[:producedBy]->(tx:TX)-[:isAt]->(block:Block)

RETURN tx.hash as tx_hash
`;
};

const getSpentCypherPart = (addresses: string[], paymentCreds: string[]) => {
  if (addresses.length === 0 && paymentCreds.length === 0) return "";

  const whereClause = addresses.length !== 0 && paymentCreds.length !== 0
    ? "WHERE o.payment_cred IN $payment_creds OR o.address IN $addresses"
    : addresses.length !== 0
      ? "WHERE o.address IN $addresses"
      : "WHERE o.payment_cred IN $payment_creds";

  return `MATCH (o:TX_OUT)
${whereClause}
MATCH (o)-[:sourceOf]->(:TX_IN)-[:inputOf]->(tx:TX)-[:isAt]->(block:Block)

RETURN tx.hash as tx_hash
`;
};

const getCertificatesCypherPart = (addrKeyHashes: string[]) => {
  if (addrKeyHashes.length === 0) return "";

  return `MATCH (cert:CERTIFICATE)
WHERE cert.addrKeyHash IN $addr_key_hashes
MATCH (cert)-[:generatedAt]->(tx:TX)

RETURN tx.hash as tx_hash

`;
};

const getWithdrawalsCypherPart = (rewardAddresses: string[]) => {
  if (rewardAddresses.length === 0) return "";

  return `OPTIONAL MATCH (wit:WITHDRAWAL)
WHERE wit.address IN $reward_addresses
MATCH (wit)-[:withdrewAt]->(tx:TX)

RETURN tx.hash as tx_hash

`;
};

const getTxsCypherPart = (
  addresses: string[],
  paymentCreds: string[],
  addrKeyHashes: string[],
  rewardAddresses: string[]
) => {
  const parts = [] as string[];
  if (addresses.length > 0 || paymentCreds.length > 0) {
    parts.push(getReceivedCypherPart(addresses, paymentCreds));
    parts.push(getSpentCypherPart(addresses, paymentCreds));
  }
  
  if (addrKeyHashes.length > 0) {
    parts.push(getCertificatesCypherPart(addrKeyHashes));
  }

  if (rewardAddresses.length > 0) {
    parts.push(getWithdrawalsCypherPart(rewardAddresses));
  }

  return parts.join(`
UNION

`);
};

export namespace Neo4jModel {
  export type BigNumber = Integer | string | number;

  export type Block = {
    body_size: BigNumber
    number: BigNumber
    tx_count: BigNumber
    era: string
    epoch_slot: BigNumber
    epoch: BigNumber
    slot: BigNumber
    issuer_vkey: string
    hash: string
    previous_hash: string
  }

  export type TX = {
    total_output: BigNumber
    output_count: BigNumber
    input_count: BigNumber
    is_valid: boolean
    fee: BigNumber
    tx_index: BigNumber
    mint_count: BigNumber
    ttl: BigNumber
    hash: string
    metadata?: string
  }

  export type TX_OUT = {
    amount: BigNumber,
    assets: [] | string,
    address: string,
    id: string,
    datum_hash: string,
    stake_cred: string,
    payment_cred: string
  }

  export type TX_IN = {
    index: BigNumber
    tx_id: string
  }

  export type WITHDRAWAL = {
    address: string
    amount: BigNumber
  }

  export enum CertificateType {
    StakeRegistration = "stake_registration",
    StakeDeregistration = "stake_deregistration",
    StakeDelegation = "stake_delegation",
    PoolRegistration = "pool_registration",
    PoolRetirement = "pool_retirement",
    GenesisKeyDelegation = "genesis_key_delegation",
  }

  export type CERTIFICATE = {
    type: CertificateType,
    cert_index: BigNumber,
    addrKeyHash: string | null,
    scriptHash: string | null,
    pool_keyhash: string | null,
    operator: string | null,
    vrf_keyhash: string | null,
    pledge: BigNumber | null,
    cost: BigNumber | null,
    margin: BigNumber | null,
    reward_account: string | null,
    pool_owners: string[] | null,
    relays: string | null,
    url: string | null,
    pool_metadata_hash: string | null
  }

  export type SCRIPT = {
    script_hash: string
    script_hex: string
  }
}

const certificateToKindMap: {[key in Neo4jModel.CertificateType]: string} = {
  [Neo4jModel.CertificateType.GenesisKeyDelegation]: "StakeDelegation",
  [Neo4jModel.CertificateType.PoolRegistration]: "PoolRegistration",
  [Neo4jModel.CertificateType.PoolRetirement]: "PoolRetirement",
  [Neo4jModel.CertificateType.StakeDelegation]: "StakeDelegation",
  [Neo4jModel.CertificateType.StakeDeregistration]: "StakeDeregistration",
  [Neo4jModel.CertificateType.StakeRegistration]: "StakeRegistration",
};

const mapCertificateKind = (certificateType: Neo4jModel.CertificateType) => {
  return certificateToKindMap[certificateType];
};

const getRewardAddressFromCertificate = (cert: Neo4jModel.CERTIFICATE) => {
  if (cert.addrKeyHash) {
    const rewardAddress = RewardAddress.new(
      config.get("network") === "mainnet"
        ? NetworkInfo.mainnet().network_id()
        : NetworkInfo.testnet().network_id(),
      StakeCredential.from_keyhash(
        Ed25519KeyHash.from_bytes(
          Buffer.from(cert.addrKeyHash, "hex")
        )
      )
    );

    return Buffer.from(rewardAddress.to_address().to_bytes()).toString("hex");
  }

  return null;
};

const formatNeo4jBigNumber = (n: Neo4jModel.BigNumber | null) => {
  if (!n) return n;
  return typeof n === "string" || typeof n === "number"
    ? n.toString()
    : n.toNumber().toString();
};

const neo4jBigNumberAsNumber = (n: Neo4jModel.BigNumber) => {
  return typeof n === "string"
    ? parseInt(n)
    : typeof n === "number"
      ? n
      : n.toInt();
};

const formatNeo4jCertificate = (cert: Neo4jModel.CERTIFICATE, block: Neo4jModel.Block) => {
  const kind = mapCertificateKind(cert.type);
  switch (cert.type) {
    case Neo4jModel.CertificateType.StakeRegistration:
      return {
        kind,
        certIndex: cert.cert_index,
        rewardAddress: getRewardAddressFromCertificate(cert)
      };
    case Neo4jModel.CertificateType.StakeDeregistration:
      return {
        kind,
        certIndex: cert.cert_index,
        rewardAddress: getRewardAddressFromCertificate(cert)
      };
    case Neo4jModel.CertificateType.StakeDelegation:
      return {
        kind,
        certIndex: cert.cert_index,
        poolKeyHash: cert.pool_keyhash,
        rewardAddress: getRewardAddressFromCertificate(cert)
      };
    case Neo4jModel.CertificateType.PoolRegistration:
      return {
        certIndex: cert.cert_index,
        operator: cert.operator,
        vrfKeyHash: cert.vrf_keyhash,
        pledge: formatNeo4jBigNumber(cert.pledge),
        cost: formatNeo4jBigNumber(cert.cost),
        margin: formatNeo4jBigNumber(cert.margin),
        rewardAccount: cert.reward_account,
        poolOwners: cert.pool_owners,
        relays: cert.relays
          ? JSON.parse(cert.relays)
          : null,
        poolMetadata:
          cert.url || cert.pool_metadata_hash
            ? {
              url: cert.url,
              metadataHash: cert.pool_metadata_hash,
            }
            : null,
      };
    case Neo4jModel.CertificateType.PoolRetirement:
      return {
        kind,
        certIndex: cert.cert_index,
        poolKeyHash: cert.pool_keyhash,
        epoch: formatNeo4jBigNumber(block.epoch),
      };
    // ToDo: add MoveInstantaneousRewardsCert type
    default:
      return null;
  }
};

const neo4jCast = <T>(r: any) => {
  return r.properties as T;
};

const getPaginationParameters = (session: Session) => async (reqBody: any) => {
  const untilCypher = `CALL {
  MATCH (:Block{hash:$untilBlock})<-[:isAt]-(untilTx:TX)
  RETURN untilTx ORDER BY untilTx.tx_index LIMIT 1
}`;
  const afterCypher = `CALL {
  MATCH (:Block{hash:$afterBlock})<-[:isAt]-(afterTx:TX{hash:$afterTx})
  RETURN afterTx
}`;

  const matchParts = [] as string[];
  const returnParts = [] as string[];

  matchParts.push(untilCypher);
  returnParts.push("ID(untilTx) as untilTx");

  if (reqBody.after?.block && reqBody.after?.tx) {
    matchParts.push(afterCypher);
    returnParts.push("ID(afterTx) as afterTx");
  }

  const matchPart = matchParts.join("\n");
  const returnPart = returnParts.join(",");

  const cypher = `${matchPart}
RETURN ${returnPart}`;

  const result = await session.run(cypher, {
    untilBlock: reqBody.untilBlock,
    afterBlock: reqBody.after?.block,
    afterTx: reqBody.after?.tx,
  });

  if (result.records.length === 0) {
    throw new Error("REFERENCE_BEST_BLOCK_MISMATCH");
  }

  const record = result.records[0];
  const untilTx = record.has("untilTx")
    ? record.get("untilTx") as Integer
    : undefined;
  const afterTx = record.has("afterTx")
    ? record.get("afterTx") as Integer
    : undefined;

  if (!untilTx) {
    throw new Error("REFERENCE_BEST_BLOCK_MISMATCH");
  }

  if (!afterTx && reqBody.after) {
    throw new Error("REFERENCE_BLOCK_MISMATCH");
  }

  return {
    untilTx: neo4jBigNumberAsNumber(untilTx),
    afterTx: afterTx
      ? neo4jBigNumberAsNumber(afterTx)
      : 0
  };
};

export const history = (driver: Driver) => ({
  handler: async (req: Request, res: Response) => {
    const addresses = req.body.addresses as string[];

    const {
      bech32OrBase58Addresses,
      paymentCreds,
      addrKeyHashes,
      rewardAddresses
    } = getAddressesByType(addresses);

    const session = driver.session();

    const paginationParameters = await getPaginationParameters(session)(req.body);

    const txsCypherPart = getTxsCypherPart(
      bech32OrBase58Addresses,
      paymentCreds,
      addrKeyHashes,
      rewardAddresses
    );

    const cypher = `CALL {
  ${txsCypherPart}
}

WITH tx_hash
WITH collect(tx_hash) as tx_hashes

MATCH (tx:TX)
WHERE tx.hash IN tx_hashes

MATCH (tx)-[:isAt]->(block:Block)
WHERE Id(tx) <= $untilTx AND Id(tx) > $afterTx

WITH DISTINCT tx, block ORDER BY block.number, tx.tx_index LIMIT 50


OPTIONAL MATCH (tx_out:TX_OUT)-[:producedBy]->(tx)
WITH block, tx, apoc.coll.sortNodes(collect(tx_out), '^output_index') as outputs

OPTIONAL MATCH (tx_in:TX_IN)-[:inputOf]->(tx)
OPTIONAL MATCH (src_tx_out:TX_OUT)-[:sourceOf]->(tx_in)
WITH block, tx, outputs, apoc.coll.sortMaps(collect({
  tx_in: tx_in,
  tx_out: src_tx_out
}), '^tx_in.input_index') as inputs

OPTIONAL MATCH (c_tx_in:COLLATERAL_TX_IN)-[:collateralInputOf]->(tx)
OPTIONAL MATCH (src_tx_out:TX_OUT)-[:sourceOf]->(c_tx_in)
WITH block, tx, outputs, inputs, collect({
  tx_in: c_tx_in,
  tx_out: src_tx_out
}) as collateral_inputs

OPTIONAL MATCH (withdrawal:WITHDRAWAL)-[:withdrewAt]->(tx)
WITH block, tx, outputs, inputs, collateral_inputs, collect(withdrawal) as withdrawals

OPTIONAL MATCH (cert:CERTIFICATE)-[:generatedAt]->(tx)
WITH block, tx, outputs, inputs, collateral_inputs, withdrawals, collect(cert) as certificates

OPTIONAL MATCH (script:SCRIPT)-[:createdAt]->(tx)
WITH block, tx, outputs, inputs, collateral_inputs, withdrawals, certificates, collect(script) as scripts

RETURN block, tx, outputs, inputs, collateral_inputs, withdrawals, certificates, scripts;`;

    const response = await session.run(cypher, {
      addresses: bech32OrBase58Addresses,
      payment_creds: paymentCreds,
      addr_key_hashes: addrKeyHashes,
      reward_addresses: rewardAddresses,
      ...paginationParameters
    });

    await session.close();

    const txs = response.records.map(r => {
      const tx = neo4jCast<Neo4jModel.TX>(r.get("tx"));
      const block = neo4jCast<Neo4jModel.Block>(r.get("block"));
      const outputs = (r.get("outputs") as any[]).map((o: any) => neo4jCast<Neo4jModel.TX_OUT>(o));
      const withdrawals = (r.get("withdrawals") as any[]).map((o: any) => neo4jCast<Neo4jModel.WITHDRAWAL>(o));
      const certificates = (r.get("certificates") as any[]).map((o: any) => neo4jCast<Neo4jModel.CERTIFICATE>(o));
      const inputs = (r.get("inputs") as any[]).map((i: any) => ({
        tx_in: neo4jCast<Neo4jModel.TX_IN>(i.tx_in),
        tx_out: i.tx_out
          ? neo4jCast<Neo4jModel.TX_OUT>(i.tx_out)
          : null
      }));
      const collateralInputs = (r.get("collateral_inputs") as any[]).map((i: any) => {
        if (!i.tx_in) return null;
        return {
          tx_in: neo4jCast<Neo4jModel.TX_IN>(i.tx_in),
          tx_out: i.tx_out
            ? neo4jCast<Neo4jModel.TX_OUT>(i.tx_out)
            : null
        };
      }).reduce((prev, curr) => {
        if (curr) {
          prev.push(curr);
        }
        return prev;
      }, [] as {
        tx_in: Neo4jModel.TX_IN,
        tx_out: Neo4jModel.TX_OUT | null
      }[]);
      const scripts = (r.get("scripts") as any[]).map((o: any) => neo4jCast<Neo4jModel.SCRIPT>(o));
      
      return {
        hash: tx.hash,
        fee: neo4jBigNumberAsNumber(tx.fee).toString(),
        metadata: tx.metadata ? JSON.parse(tx.metadata) : null,
        valid_contract: tx.is_valid,
        script_size: getScriptsSize(scripts),
        type: block.era === "byron" ? "byron" : "shelley",
        withdrawals: withdrawals.map(w => ({
          address: w.address,
          amount: formatNeo4jBigNumber(w.amount),
          dataHash: null,
          assets: []
        })),
        certificates: certificates.map(c => formatNeo4jCertificate(c, block)),
        tx_ordinal: neo4jBigNumberAsNumber(tx.tx_index),
        tx_state: "Successful",
        last_update: blockDate(block),
        block_num: neo4jBigNumberAsNumber(block.number),
        block_hash: block.hash,
        time: blockDate(block),
        epoch: neo4jBigNumberAsNumber(block.epoch),
        slot: neo4jBigNumberAsNumber(block.epoch_slot),
        inputs: inputs.map(i => ({
          address: i.tx_out?.address,
          amount: i.tx_out ?
            formatNeo4jBigNumber(i.tx_out.amount)
            : null,
          id: `${i.tx_in.tx_id}${neo4jBigNumberAsNumber(i.tx_in.index)}`,
          index: neo4jBigNumberAsNumber(i.tx_in.index),
          txHash: i.tx_in.tx_id,
          assets: mapNeo4jAssets(i.tx_out?.assets)
        })),
        collateral_inputs: collateralInputs.map(i => ({
          address: i.tx_out?.address,
          amount: i.tx_out
            ? formatNeo4jBigNumber(i.tx_out.amount)
            : null,
          id: i.tx_out?.id,
          index: neo4jBigNumberAsNumber(i.tx_in.index).toString(),
          txHash: i.tx_in.tx_id,
          assets: mapNeo4jAssets(i.tx_out?.assets)
        })),
        outputs: outputs.map(o => ({
          address: o.address,
          amount: formatNeo4jBigNumber(o.amount),
          dataHash: o.datum_hash ?? null,
          assets: mapNeo4jAssets(o.assets)
        })),
      };
    });

    return res.send(txs);
  }
});