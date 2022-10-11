import { Integer, Session } from "neo4j-driver";
import { Request, Response } from "express";
import {
  Address,
  ByronAddress,
  Ed25519KeyHash,
  NetworkInfo,
  RewardAddress,
  StakeCredential
} from "@emurgo/cardano-serialization-lib-nodejs";
import config from "config";
import { Driver } from "neo4j-driver-core";

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
  const untilBlockCypher = "MATCH (untilBlock:Block{hash:$untilBlock})";
  const afterBlockCypher = "MATCH (afterBlock:Block{hash:$afterBlock})";
  const afterTxCypher = "MATCH (afterTx:TX{hash:$afterTx})";

  const matchParts = [] as string[];
  const returnParts = [] as string[];

  matchParts.push(untilBlockCypher);
  returnParts.push("{number: untilBlock.number} as untilBlock");

  if (reqBody.after?.block) {
    matchParts.push(afterBlockCypher);
    returnParts.push("{number: afterBlock.number} as afterBlock");
  }
  if (reqBody.after?.tx) {
    matchParts.push(afterTxCypher);
    returnParts.push("{tx_index: afterTx.tx_index} as afterTx");
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

  const record = result.records[0];
  const untilBlock = record.has("untilBlock")
    ? record.get("untilBlock") as Neo4jModel.Block
    : undefined;
  const afterBlock = record.has("afterBlock")
    ? record.get("afterBlock") as Neo4jModel.Block
    : undefined;
  const afterTx = record.has("afterTx")
    ? record.get("afterTx") as Neo4jModel.TX
    : undefined;

  if (!untilBlock) {
    throw new Error("REFERENCE_BEST_BLOCK_MISMATCH");
  }

  if (!afterBlock && reqBody.after?.block) {
    throw new Error("REFERENCE_BLOCK_MISMATCH");
  }

  if (!afterTx && reqBody.after?.tx) {
    throw new Error("REFERENCE_TX_NOT_FOUND");
  }

  return {
    untilBlock: neo4jBigNumberAsNumber(untilBlock.number),
    afterBlock: afterBlock
      ? neo4jBigNumberAsNumber(afterBlock.number)
      : 0,
    afterTx: afterTx
      ? neo4jBigNumberAsNumber(afterTx.tx_index)
      : 0
  };
};

const getAddressesByType = (addresses: string[]) => {
  const bech32OrBase58Addresses = [] as string[];
  const paymentCreds = [] as string[];
  const addrKeyHashes = [] as string[];
  const rewardAddresses = [] as string[];

  for (const address of addresses) {
    if (ByronAddress.is_valid(address)) {
      bech32OrBase58Addresses.push(address);
      bech32OrBase58Addresses.push(ByronAddress.from_base58(address).to_address().to_bech32());
      continue;
    }

    if (address.startsWith("addr_vkh")) {
      const keyHash = Ed25519KeyHash.from_bech32(address);
      const cred = StakeCredential.from_keyhash(keyHash);
      paymentCreds.push(Buffer.from(cred.to_bytes()).toString("hex"));
      continue;
    }

    if (address.startsWith("addr") || address.startsWith("addr_test")) {
      bech32OrBase58Addresses.push(address);
      continue;
    }

    if (address.startsWith("stake") || address.startsWith("stake_test")) {
      const rewardAddress = RewardAddress.from_address(
        Address.from_bech32(address)
      );
      if (rewardAddress) {
        rewardAddresses.push(Buffer.from(rewardAddress.to_address().to_bytes()).toString("hex"));
        const cred = rewardAddress.payment_cred();
        const keyHash = cred.to_keyhash();
        if (keyHash) {
          addrKeyHashes.push(Buffer.from(keyHash.to_bytes()).toString("hex"));
        }
      }
      continue;
    }
  }

  return {
    bech32OrBase58Addresses,
    paymentCreds,
    addrKeyHashes,
    rewardAddresses
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

WITH DISTINCT tx, block ORDER BY block.number, tx.tx_index LIMIT 50

OPTIONAL MATCH (tx_out:TX_OUT)-[:producedBy]->(tx)
WITH block, tx, collect(tx_out) as outputs

OPTIONAL MATCH (tx_in:TX_IN)-[:inputOf]->(tx)
OPTIONAL MATCH (src_tx_out:TX_OUT)-[:sourceOf]->(tx_in)
WITH block, tx, outputs, collect({
  tx_in: tx_in,
  tx_out: src_tx_out
}) as inputs

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

    const txs = response.records.map(r => {
      const tx = neo4jCast<Neo4jModel.TX>(r.get("tx"));
      const block = neo4jCast<Neo4jModel.Block>(r.get("block"));
      const outputs = (r.get("outputs") as any[]).map((o: any) => neo4jCast<Neo4jModel.TX_OUT>(o));
      const withdrawals = (r.get("withdrawals") as any[]).map((o: any) => neo4jCast<Neo4jModel.WITHDRAWAL>(o));
      const certificates = (r.get("certificates") as any[]).map((o: any) => neo4jCast<Neo4jModel.CERTIFICATE>(o));
      const inputs = (r.get("inputs") as any[]).map((i: any) => ({
        tx_in: neo4jCast<Neo4jModel.TX_IN>(i.tx_in),
        tx_out: neo4jCast<Neo4jModel.TX_OUT>(i.tx_out)
      }));
      const collateralInputs = (r.get("collateral_inputs") as any[]).map((i: any) => {
        if (!i.tx_in) return null;
        return {
          tx_in: neo4jCast<Neo4jModel.TX_IN>(i.tx_in),
          tx_out: neo4jCast<Neo4jModel.TX_OUT>(i.tx_out)
        };
      }).reduce((prev, curr) => {
        if (curr) {
          prev.push(curr);
        }
        return prev;
      }, [] as {
        tx_in: Neo4jModel.TX_IN,
        tx_out: Neo4jModel.TX_OUT
      }[]);
      const scripts = (r.get("scripts") as any[]).map((o: any) => neo4jCast<Neo4jModel.SCRIPT>(o));
      
      return {
        hash: tx.hash,
        fee: neo4jBigNumberAsNumber(tx.fee).toString(),
        metadata: tx.metadata ? JSON.parse(tx.metadata) : null,
        validContract: tx.is_valid,
        scriptSize: getScriptsSize(scripts),
        type: block.era === "byron" ? "byron" : "shelley",
        withdrawals: withdrawals.map(w => ({
          address: w.address,
          amount: formatNeo4jBigNumber(w.amount),
          dataHash: null,
          assets: []
        })),
        certificates: certificates.map(c => formatNeo4jCertificate(c, block)),
        txOrdinal: neo4jBigNumberAsNumber(tx.tx_index),
        txState: "Successful",
        lastUpdate: blockDate(block),
        blockNum: neo4jBigNumberAsNumber(block.number),
        blockHash: block.hash,
        time: blockDate(block),
        epoch: neo4jBigNumberAsNumber(block.epoch),
        slot: neo4jBigNumberAsNumber(block.epoch_slot),
        inputs: inputs.map(i => ({
          address: i.tx_out.address,
          amount: formatNeo4jBigNumber(i.tx_out.amount),
          id: `${i.tx_in.tx_id}${neo4jBigNumberAsNumber(i.tx_in.index)}`,
          index: neo4jBigNumberAsNumber(i.tx_in.index),
          txHash: i.tx_in.tx_id,
          assets: i.tx_out.assets && typeof i.tx_out.assets === "string"
            ? JSON.parse(i.tx_out.assets).map((a: any) => ({
              assetId: `${a.policy}.${a.asset}`,
              policyId: a.policy,
              name: a.asset,
              amount: a.amount.toString()
            }))
            : []
        })),
        collateralInputs: collateralInputs.map(i => ({
          address: i.tx_out.address,
          amount: formatNeo4jBigNumber(i.tx_out.amount),
          id: i.tx_out.id,
          index: neo4jBigNumberAsNumber(i.tx_in.index).toString(),
          txHash: i.tx_in.tx_id,
          assets: i.tx_out.assets && typeof i.tx_out.assets === "string"
            ? JSON.parse(i.tx_out.assets).map((a: any) => ({
              assetId: `${a.policy}.${a.asset}`,
              policyId: a.policy,
              name: a.asset,
              amount: a.amount.toString()
            }))
            : []
        })),
        outputs: outputs.map(o => ({
          address: o.address,
          amount: formatNeo4jBigNumber(o.amount),
          dataHash: o.datum_hash ?? null,
          assets: o.assets && typeof o.assets === "string"
            ? JSON.parse(o.assets).map((a: any) => ({
              assetId: `${a.policy}.${a.asset}`,
              policyId: a.policy,
              name: a.asset,
              amount: a.amount.toString()
            }))
            : []
        })),
      };
    });

    return res.send(txs);
  }
});