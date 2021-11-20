import { Pool } from "pg";

export type PolicyIdAssetMapType = Record<string, Array<string>>;
export type PolicyIdAssetMetadataInfoMap = Record<string, AssetMetadataInfoMap>;
export type MultiAssetTxMintMetadataType = {
  key: string;
  metadata: any;
};

type AssetMetadataInfoMap = Record<
  string,
  {
    name: string;
    imageUrl: string;
  } & { policy: string }
>;

// NFT metadata format - https://cips.cardano.org/cips/cip25/
const NFT_METADATA_ONCHAIN_KEY = "721";

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

  // NFT metadata format - https://cips.cardano.org/cips/cip25/
  const query = `
      select encode(mint.policy, 'hex') as policy,
        encode(mint.name, 'hex') as asset,
        meta.key,
        meta.json
      from ma_tx_mint mint
        join tx on mint.tx_id = tx.id
        join tx_metadata meta on tx.id = meta.tx_id
      where meta.key=${NFT_METADATA_ONCHAIN_KEY} AND ( ${whereConditions} )`;
  return query;
}

export async function getMultiAssetTxMintMetadata(
  pool: Pool,
  assets: PolicyIdAssetMapType
): Promise<Record<string, MultiAssetTxMintMetadataType[]>> {
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
): PolicyIdAssetMetadataInfoMap {
  const results = Object.keys(policyIdAssetMap).reduce<PolicyIdAssetMetadataInfoMap>(
    (policyMap, policyIdHex: string) => {
      const assetNamesHex: string[] = policyIdAssetMap[policyIdHex];
      const assetInfoMap = assetNamesHex?.reduce<AssetMetadataInfoMap>(
        (assetMap, assetHex: string) => {
          const identifier = `${policyIdHex}.${assetHex}`;
          const mintTxData = metadata[identifier];
          const assetNameAscii = hex_to_ascii(assetHex);
          const tokenMeta = mintTxData?.filter(
            (txData: MultiAssetTxMintMetadataType) =>
              txData.key === NFT_METADATA_ONCHAIN_KEY
          )?.[0];

          if (tokenMeta !== null) {
            const mintedTokens = tokenMeta?.["metadata"];

            if (
              mintedTokens == null ||
              mintedTokens?.[policyIdHex]?.[assetNameAscii] == null
            ) {
              return assetMap;
            }

            const currentAssetDetails =
              mintedTokens[policyIdHex][assetNameAscii];

            // image and name should be present
            if (
              currentAssetDetails?.name == null ||
              currentAssetDetails?.image == null
            ) {
              return assetMap;
            }
            if (
              typeof currentAssetDetails.name === "string" ||
              typeof currentAssetDetails.image === "string"
            ) {
              return assetMap;
            }

            assetMap[assetHex] = {
              name: currentAssetDetails.name,
              imageUrl: currentAssetDetails.image,
              policy: policyIdHex,
            };
          }
          return assetMap;
        },
        {}
      );
      if (Object.keys(assetInfoMap).length > 0) {
        policyMap[policyIdHex] = assetInfoMap;
      }

      return policyMap;
    },
    {}
  );

  return results;
}
