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

const getReceivedSpentCypherPart = (addresses: string[], paymentCreds: string[]) => {
  if (addresses.length === 0 && paymentCreds.length === 0) return "";

  const whereClause = addresses.length !== 0 && paymentCreds.length !== 0
    ? "WHERE tx_out.payment_cred IN $payment_creds OR tx_out.address IN $addresses"
    : addresses.length !== 0
      ? "WHERE tx_out.address IN $addresses"
      : "WHERE tx_out.payment_cred IN $payment_creds";

  return `OPTIONAL MATCH (tx_out:TX_OUT)
${whereClause}
OPTIONAL MATCH (tx_out)-[:producedBy]->(received_tx:TX)
OPTIONAL MATCH (tx_out)-[:sourceOf]->(tx_in:TX_IN)
OPTIONAL MATCH (tx_in)-[:inputOf]->(spent_tx:TX)

`;
};

const getCertificatesCypherPart = (addrKeyHashes: string[]) => {
  if (addrKeyHashes.length === 0) return "";

  return `OPTIONAL MATCH (cert:CERTIFICATE)
WHERE cert.addrKeyHash IN $addr_key_hashes
OPTIONAL MATCH (cert)-[:generatedAt]->(cert_tx:TX)

`;
};

const getWithdrawalsCypherPart = (rewardAddresses: string[]) => {
  if (rewardAddresses.length === 0) return "";

  return `OPTIONAL MATCH (wit:WITHDRAWAL)
WHERE wit.address IN $reward_addresses
OPTIONAL MATCH (wit)-[:withdrewAt]->(wit_tx:TX)

`;
};

const getWithTxsCypherPart = (
  addresses: string[],
  paymentCreds: string[],
  addrKeyHashes: string[],
  rewardAddresses: string[]
) => {
  const parts = [] as string[];
  if (addresses.length > 0 || paymentCreds.length > 0) {
    parts.push("collect(received_tx)");
    parts.push("collect(spent_tx)");
  }
  if (addrKeyHashes.length > 0) {
    parts.push("collect(cert_tx)");
  }
  if (rewardAddresses.length > 0) {
    parts.push("collect(wit_tx)");
  }
  return `WITH ${parts.join("+")} as txs
  
  `;
};

const getTxsCypherPart = (
  addresses: string[],
  paymentCreds: string[],
  addrKeyHashes: string[],
  rewardAddresses: string[]
) => {
  const parts = [] as string[];
  parts.push(getReceivedSpentCypherPart(addresses, paymentCreds));
  parts.push(getCertificatesCypherPart(addrKeyHashes));
  parts.push(getWithdrawalsCypherPart(rewardAddresses));
  parts.push(getWithTxsCypherPart(
    addresses,
    paymentCreds,
    addrKeyHashes,
    rewardAddresses
  ));
  return parts.join("");
};

export namespace Neo4jModel {
  export type BigNumber = Integer | string;

  export type Block = {
    body_size: Integer
    number: Integer
    tx_count: Integer
    era: string
    epoch_slot: Integer
    epoch: Integer
    slot: Integer
    issuer_vkey: string
    hash: string
    previous_hash: string
  }

  export type TX = {
    total_output: Integer
    output_count: Integer
    input_count: Integer
    is_valid: boolean
    fee: Integer
    tx_index: Integer
    mint_count: Integer
    ttl: Integer
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
    index: Integer
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
    addrKeyHash: string | null,
    scriptHash: string | null,
    pool_keyhash: string | null,
    operator: string | null,
    vrf_keyhash: string | null,
    pledge: BigNumber | null,
    cost: BigNumber | null,
    reward_account: string | null,
    pool_owners: string[] | null,
    url: string | null,
    pool_metadata_hash: string | null
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
  return typeof n === "string"
    ? n
    : n.toNumber().toString();
};

const formatNeo4jCertificate = (cert: Neo4jModel.CERTIFICATE) => {
  const kind = mapCertificateKind(cert.type);
  // ToDo: add cert index to Neo4j
  switch (cert.type) {
    case Neo4jModel.CertificateType.StakeRegistration:
      return {
        kind,
        certIndex: 0,
        rewardAddress: getRewardAddressFromCertificate(cert)
      };
    case Neo4jModel.CertificateType.StakeDeregistration:
      return {
        kind,
        certIndex: 0,
        rewardAddress: getRewardAddressFromCertificate(cert)
      };
    case Neo4jModel.CertificateType.StakeDelegation:
      return {
        kind,
        certIndex: 0,
        poolKeyHash: cert.pool_keyhash,
        rewardAddress: getRewardAddressFromCertificate(cert)
      };
    case Neo4jModel.CertificateType.PoolRegistration:
      return {
        operator: cert.operator,
        vrfKeyHash: cert.vrf_keyhash,
        pledge: formatNeo4jBigNumber(cert.pledge),
        cost: formatNeo4jBigNumber(cert.cost),
        margin: null, // ToDo: add margin to Neo4j
        rewardAccount: cert.reward_account,
        poolOwners: cert.pool_owners,
        relays: null, // ToDo: add relays to Neo4j
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
        certIndex: 0, // ToDo: add cert index to Neo4j
        poolKeyHash: cert.pool_keyhash,
        epoch: null, // ToDo: add epoch to Neo4j
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
    untilBlock: untilBlock.number.toInt(),
    afterBlock: afterBlock?.number.toInt() ?? 0,
    afterTx: afterTx?.tx_index.toInt() ?? 0
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

    const cypher = `${txsCypherPart}

UNWIND txs as tx

WITH DISTINCT tx, block LIMIT 50

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

ORDER BY block.number, tx.tx_index

RETURN block, tx, outputs, inputs, collateral_inputs, withdrawals, certificates;`;

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
      
      return {
        hash: tx.hash,
        fee: tx.fee.toInt().toString(),
        metadata: tx.metadata ? JSON.parse(tx.metadata) : null,
        validContract: tx.is_valid,
        scriptSize: 0, // ToDo: missing data on Neo4j
        type: block.era === "byron" ? "byron" : "shelley",
        withdrawals: withdrawals.map(w => ({
          address: w.address,
          amount: formatNeo4jBigNumber(w.amount),
          dataHash: null,
          assets: []
        })),
        certificates: certificates.map(formatNeo4jCertificate),
        txOrdinal: tx.tx_index.toInt(),
        txState: "Successful",
        lastUpdate: null, // ToDo: this can be calculated based on the epoch
        blockNum: block.number.toInt(),
        blockHash: block.hash,
        time: null, // ToDo: this can be calculated based on the epoch
        epoch: block.epoch.toInt(),
        slot: block.epoch_slot.toInt(),
        inputs: inputs.map(i => ({
          address: i.tx_out.address,
          amount: formatNeo4jBigNumber(i.tx_out.amount),
          id: i.tx_out.id,
          index: i.tx_in.index.toNumber().toString(),
          txHash: i.tx_in.tx_id,
          assets: i.tx_out.assets && typeof i.tx_out.assets === "string"
            ? JSON.parse(i.tx_out.assets)
            : []
        })),
        collateralInputs: collateralInputs.map(i => ({
          address: i.tx_out.address,
          amount: formatNeo4jBigNumber(i.tx_out.amount),
          id: i.tx_out.id,
          index: i.tx_in.index.toNumber().toString(),
          txHash: i.tx_in.tx_id,
          assets: i.tx_out.assets && typeof i.tx_out.assets === "string"
            ? JSON.parse(i.tx_out.assets)
            : []
        })),
        outputs: outputs.map(o => ({
          address: o.address,
          amount: formatNeo4jBigNumber(o.amount),
          dataHash: o.datum_hash,
          assets: o.assets && typeof o.assets === "string"
            ? JSON.parse(o.assets)
            : []
        })),
      };
    });

    return res.send(txs);
  }
});