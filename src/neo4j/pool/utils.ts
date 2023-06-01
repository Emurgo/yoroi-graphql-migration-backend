import axios from "axios";
import config from "config";

const smashEndpoint: string = config.get("server.smashEndpoint");

export const getPayload = (cert: any) => {
  switch (cert.type) {
    case "pool_registration":
      return {
        kind: "PoolRegistration",
        certIndex: cert.cert_index.toNumber(),
        poolParams: {
          operator: cert.operator,
          vrfKeyHash: cert.vrf_keyhash,
          pledge: cert.pledge.toNumber().toString(),
          cost: cert.cost.toNumber().toString(),
          margin: cert.margin,
          rewardAccount: cert.reward_account,
          poolOwners: cert.pool_owners.map((owner: any) => { return "e1" + owner; }),
          relays: JSON.parse(cert.relays).map((r: any) => ({
            ipv4: (r.ipv4) ? r.ipv4.data.join(".") : null,
            ipv6: r.ipv6,
            dnsName: (r.dnsName) ? r.dnsName.toString() : null,
            dnsSrvName: (r.dns_srv_name) ? r.dns_srv_name.data.toString() : null,
            port: (r.port) ? r.port.toString() : null,
          })),
          poolMetadata: {
            url: cert.url,
            metadataHash: cert.pool_metadata_hash
          }
        }
      };
    case "pool_retirement":
      return {
        kind: "PoolRetirement",
        certIndex: cert.cert_index.toNumber(),
        poolKeyHash: cert.pool_keyhash,
        epoch: cert.epoch.toNumber(),
      };
  }
};

export const getSmashInfo = async (hash: string, metadataHash: string) => {
  try {
    const endpointResponse = await axios.get(`${smashEndpoint}${hash}/${metadataHash}`);
    if (endpointResponse.status === 200) {
      return endpointResponse.data;
    } else {
      console.log(`SMASH did not respond to user submitted hash: ${hash}`);
    }
  } catch (e) {
    console.log(`SMASH did not respond with hash ${hash}, giving error ${e}`);
  }
};