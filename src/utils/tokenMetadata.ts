import { Pool } from "pg";

export type PolicyIdAssetMapType = Record<string, Array<string>>;
export type PolicyIdAssetInfoMap = Record<string, AssetInfoMap>;
export type MultiAssetTxMintMetadataType = {
  key: string;
  metadata: any;
};

type AssetInfoMap = Record<
  string,
  {
    name?: string;
    decimals?: number;
    ticker?: string;
    url?: string;
    policy: string;
    imageUrl?: string; //only nft
    logo?: string;
  }
>;

function hex_to_ascii(str1: string) {
  const hex = str1.toString();
  let str = "";
  for (let n = 0; n < hex.length; n += 2) {
    str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
  }
  return str;
}

function createGetMultiAssetTxMintMetadataQuery(assets: PolicyIdAssetMapType) {
  const whereConditions = Object.keys(assets)
    .map((policIdHex: string) => {
      const assetNameHex = assets?.[policIdHex] ?? [];
      const query = assetNameHex
        .map(
          (assetHex) => `( encode(mint.name, 'hex')= ('${assetHex}')::varchar
        and encode(mint.policy, 'hex') = ('${policIdHex}')::varchar )`
        )
        .join(" or ");
      return query;
    })
    .join(" or ");

  const query = `
    select encode(mint.policy, 'hex') as policy,
      encode(mint.name, 'hex') as asset,
      meta.key,
      meta.json
    from ma_tx_mint mint
      join tx on mint.tx_id = tx.id
      join tx_metadata meta on tx.id = meta.tx_id
    where ${whereConditions}`;
  return query;
}

export async function getMultiAssetTxMintMetadata(
  pool: Pool,
  assets: PolicyIdAssetMapType
) {
  const query = createGetMultiAssetTxMintMetadataQuery(assets);
  const ret: { [key: string]: MultiAssetTxMintMetadataType[] } = {};
  const results = await pool.query(query);

  for (const row of results.rows) {
    const policyAndName = `${row.policy}.${row.asset}`;
    if (!ret[policyAndName]) {
      ret[policyAndName] = new Array<MultiAssetTxMintMetadataType>();
    }

    ret[policyAndName].push({
      key: row.key,
      metadata: row.json,
    });
  }

  return ret;
}

export function formatTokenMetadata(
  metadata: { [key: string]: MultiAssetTxMintMetadataType[] },
  policyIdAssetMap: PolicyIdAssetMapType
): PolicyIdAssetInfoMap {
  const results = Object.keys(policyIdAssetMap).reduce<PolicyIdAssetInfoMap>(
    (policyMap, policyIdHex: string) => {
      const assetNamesHex: string[] = policyIdAssetMap[policyIdHex];
      const assetInfoMap = assetNamesHex?.reduce<AssetInfoMap>(
        (assetMap, assetHex: string) => {
          const identifier = `${policyIdHex}.${assetHex}`;
          const mintTxData = metadata[identifier];
          const assetNameAscii = hex_to_ascii(assetHex);

          /// TODO clarify Can there be multiple txs?
          const tokenMeta = mintTxData?.[0];

          // NFT
          if (tokenMeta?.["key"] === "721") {
            const mintedTokens = tokenMeta?.["metadata"];
            const currentAssetDetails =
              mintedTokens[policyIdHex][assetNameAscii];

            assetMap[assetHex] = {
              name: currentAssetDetails?.name,
              imageUrl: currentAssetDetails?.image, // TODO will come from DB
              policy: policyIdHex,
              // what more data do we need to show at the frontend?
            };
          }
          return assetMap;
        },
        {}
      );
      policyMap[policyIdHex] = assetInfoMap;
      return policyMap;
    },
    {}
  );

  return results;
}
