import { Request, Response } from "express";
import { Driver } from "neo4j-driver-core";
import { getAddressesByType } from "../utils";
import {
  getPaginationParameters,
  neo4jTxDataToResponseTxData} from "./utils";

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

    const paginationParameters = await getPaginationParameters(driver)(req.body);

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

    const txs = neo4jTxDataToResponseTxData(response.records);

    return res.send(txs);
  }
});