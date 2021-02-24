import axios from "axios";
import { expect } from "chai";
import { config, } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "pool/info";

const realPoolId = "1b268f4cba3faa7e36d8a0cc4adca2096fb856119412ee7330f692b5"; // note: this pool has changed its metadata at least once
const fakePoolId = "00000000000000000000000000000000000000000000000000000001";
const privatePool = "b1fe7ac3669604156c20dcfc08355197af5637c37750d862039670c4";

describe("/pool/info", function() {
  it("should return information about a pool that has metadata available", async() => {
    const result = await axios({method: "post", url: testableUri, data: {poolIds: [realPoolId]}});
    expect(result.data).to.have.property(realPoolId);

    expect(result.data[realPoolId]).to.have.property("info");
    expect(result.data[realPoolId].info).to.not.be.equal(null);

    expect(result.data[realPoolId]).to.have.property("history");
    expect(result.data[realPoolId].history).to.have.lengthOf.above(0);
  });
  it("should return null info for private pool id", async() => {
    const result = await axios({method: "post", url: testableUri, data: {poolIds: [privatePool]}});
    expect(result.data).to.have.property(privatePool);

    expect(result.data[privatePool]).to.have.property("info");
    expect(result.data[privatePool].info).to.be.empty;

    expect(result.data[privatePool]).to.have.property("history");
    expect(result.data[privatePool].history).to.have.lengthOf.above(0);
  });
  it("should return null for pool id that doesn't exist on chain", async() => {
    const result = await axios({method: "post", url: testableUri, data: {poolIds: [fakePoolId]}});
    expect(result.data).to.have.property(fakePoolId);
    expect(result.data[fakePoolId]).to.be.a("null");
  });
  it("should return the right start of the history for STKH1", async() => {
    const poolId = "b62ecc8ce7e46c4443b63b91fffaeb19f869d191a7d2381087aaa768";
    const result = await axios({method: "post", url: testableUri, data: {poolIds: [poolId]}});
    expect(result.data).to.have.property(poolId);

    expect(result.data[poolId]).to.have.property("history");

    const { history } = result.data[poolId];
    // since the parameters can be changed in the time after we right this test
    // we just make sure that the suffix of the pool history matches what existed at the time this test was written
    const suffix = history.slice(history.length - stakhanoviteHistorySuffix.length, history.length);

    expect(suffix).to.deep.equal(stakhanoviteHistorySuffix);
  });
});

const stakhanoviteHistorySuffix = [{
  "epoch": 221,
  "slot": 344193,
  "tx_ordinal": 1,
  "cert_ordinal": 2,
  "payload": {
    "kind": "PoolRegistration",
    "certIndex": 2,
    "poolParams": {
      "operator": "b62ecc8ce7e46c4443b63b91fffaeb19f869d191a7d2381087aaa768",
      "vrfKeyHash": "b4506cbdf5faeeb7bc771d0c17eea2e7e94749ec5a63e78a42d9ed8aad6baae5",
      "pledge": "425000000000",
      "cost": "340000000",
      "margin": 0.019,
      "rewardAccount": "e10af10f4a5d365af01f0ca7651713a8a073263b61bbd1f69623097bd7",
      "poolOwners": ["e9aba14ed15240e855f5b62d28f0e5f913cf9c289d3cbc5d6016c1b1", "7dfe98a743499f7a67ab2f9771e683d2e9fa1a53b4632aa7e1df339f", "0a03ee791abf663e98b81661dadd72420f29bb6960ca0a676e75dd70"],
      "relays": [{
        "ipv4": null,
        "ipv6": null,
        "dnsName": "cardano-relay.stakhanovite.io",
        "dnsSrvName": null,
        "port": "7001"
      }],
      "poolMetadata": {
        "url": "https://stakhanovite.io/cardano/stkh-1.json",
        "metadataHash": "0f519c0478527c6fd05556ecb31fafe9e5a6b9861fac96f5935381b3e328ee5d"
      }
    }
  }
}, {
  "epoch": 214,
  "slot": 177894,
  "tx_ordinal": 1,
  "cert_ordinal": 2,
  "payload": {
    "kind": "PoolRegistration",
    "certIndex": 2,
    "poolParams": {
      "operator": "b62ecc8ce7e46c4443b63b91fffaeb19f869d191a7d2381087aaa768",
      "vrfKeyHash": "b4506cbdf5faeeb7bc771d0c17eea2e7e94749ec5a63e78a42d9ed8aad6baae5",
      "pledge": "425000000000",
      "cost": "340000000",
      "margin": 0.019,
      "rewardAccount": "e10af10f4a5d365af01f0ca7651713a8a073263b61bbd1f69623097bd7",
      "poolOwners": ["e9aba14ed15240e855f5b62d28f0e5f913cf9c289d3cbc5d6016c1b1", "3e04ddd9d0a3b383ff5ee2e813060b337ad2228bb51bab6dc6d843fa"],
      "relays": [{
        "ipv4": null,
        "ipv6": null,
        "dnsName": "cardano-relay.stakhanovite.io",
        "dnsSrvName": null,
        "port": "7001"
      }],
      "poolMetadata": {
        "url": "https://www.stakhanovite.io/cardano/stkh1.json",
        "metadataHash": "6a36f7a02d5895a082ffcbc1eb8c35f1e88192b8a0f27f07fb12555c7d1d1180"
      }
    }
  }
}, {
  "epoch": 210,
  "slot": 90420,
  "tx_ordinal": 1,
  "cert_ordinal": 0,
  "payload": {
    "kind": "PoolRegistration",
    "certIndex": 0,
    "poolParams": {
      "operator": "b62ecc8ce7e46c4443b63b91fffaeb19f869d191a7d2381087aaa768",
      "vrfKeyHash": "b4506cbdf5faeeb7bc771d0c17eea2e7e94749ec5a63e78a42d9ed8aad6baae5",
      "pledge": "425000000000",
      "cost": "340000000",
      "margin": 0.019,
      "rewardAccount": "e1854139fc8987990fd89699beb1b59b09c047ace356870dcaadc93b22",
      "poolOwners": ["3e04ddd9d0a3b383ff5ee2e813060b337ad2228bb51bab6dc6d843fa"],
      "relays": [{
        "ipv4": null,
        "ipv6": null,
        "dnsName": "cardano-relay.stakhanovite.io",
        "dnsSrvName": null,
        "port": "7001"
      }],
      "poolMetadata": {
        "url": "https://www.stakhanovite.io/cardano/stkh1.json",
        "metadataHash": "6a36f7a02d5895a082ffcbc1eb8c35f1e88192b8a0f27f07fb12555c7d1d1180"
      }
    }
  }
}, {
  "epoch": 208,
  "slot": 259540,
  "tx_ordinal": 4,
  "cert_ordinal": 0,
  "payload": {
    "kind": "PoolRegistration",
    "certIndex": 0,
    "poolParams": {
      "operator": "b62ecc8ce7e46c4443b63b91fffaeb19f869d191a7d2381087aaa768",
      "vrfKeyHash": "b4506cbdf5faeeb7bc771d0c17eea2e7e94749ec5a63e78a42d9ed8aad6baae5",
      "pledge": "165000000000",
      "cost": "340000000",
      "margin": 0.019,
      "rewardAccount": "e1854139fc8987990fd89699beb1b59b09c047ace356870dcaadc93b22",
      "poolOwners": ["3e04ddd9d0a3b383ff5ee2e813060b337ad2228bb51bab6dc6d843fa"],
      "relays": [{
        "ipv4": null,
        "ipv6": null,
        "dnsName": "cardano-relay.stakhanovite.io",
        "dnsSrvName": null,
        "port": "7001"
      }],
      "poolMetadata": {
        "url": "https://www.stakhanovite.io/cardano/stkh1.json",
        "metadataHash": "6a36f7a02d5895a082ffcbc1eb8c35f1e88192b8a0f27f07fb12555c7d1d1180"
      }
    }
  }
}, {
  "epoch": 208,
  "slot": 176460,
  "tx_ordinal": 1,
  "cert_ordinal": 0,
  "payload": {
    "kind": "PoolRegistration",
    "certIndex": 0,
    "poolParams": {
      "operator": "b62ecc8ce7e46c4443b63b91fffaeb19f869d191a7d2381087aaa768",
      "vrfKeyHash": "b4506cbdf5faeeb7bc771d0c17eea2e7e94749ec5a63e78a42d9ed8aad6baae5",
      "pledge": "100000000000",
      "cost": "340000000",
      "margin": 0.019,
      "rewardAccount": "e1854139fc8987990fd89699beb1b59b09c047ace356870dcaadc93b22",
      "poolOwners": ["3e04ddd9d0a3b383ff5ee2e813060b337ad2228bb51bab6dc6d843fa"],
      "relays": [{
        "ipv4": null,
        "ipv6": null,
        "dnsName": "cardano-relay.stakhanovite.io",
        "dnsSrvName": null,
        "port": "7001"
      }],
      "poolMetadata": {
        "url": "https://www.stakhanovite.io/cardano/stkh1.json",
        "metadataHash": "6a36f7a02d5895a082ffcbc1eb8c35f1e88192b8a0f27f07fb12555c7d1d1180"
      }
    }
  }
}, {
  "epoch": 208,
  "slot": 90920,
  "tx_ordinal": 0,
  "cert_ordinal": 0,
  "payload": {
    "kind": "PoolRegistration",
    "certIndex": 0,
    "poolParams": {
      "operator": "b62ecc8ce7e46c4443b63b91fffaeb19f869d191a7d2381087aaa768",
      "vrfKeyHash": "b4506cbdf5faeeb7bc771d0c17eea2e7e94749ec5a63e78a42d9ed8aad6baae5",
      "pledge": "1000000",
      "cost": "340000000",
      "margin": 0.01935,
      "rewardAccount": "e1854139fc8987990fd89699beb1b59b09c047ace356870dcaadc93b22",
      "poolOwners": ["3e04ddd9d0a3b383ff5ee2e813060b337ad2228bb51bab6dc6d843fa"],
      "relays": [{
        "ipv4": null,
        "ipv6": null,
        "dnsName": "cardano-relay.stakhanovite.io",
        "dnsSrvName": null,
        "port": "7001"
      }],
      "poolMetadata": {
        "url": "https://www.stakhanovite.io/cardano/stkh1.json",
        "metadataHash": "6a36f7a02d5895a082ffcbc1eb8c35f1e88192b8a0f27f07fb12555c7d1d1180"
      }
    }
  }
}, {
  "epoch": 208,
  "slot": 11160,
  "tx_ordinal": 1,
  "cert_ordinal": 0,
  "payload": {
    "kind": "PoolRegistration",
    "certIndex": 0,
    "poolParams": {
      "operator": "b62ecc8ce7e46c4443b63b91fffaeb19f869d191a7d2381087aaa768",
      "vrfKeyHash": "b4506cbdf5faeeb7bc771d0c17eea2e7e94749ec5a63e78a42d9ed8aad6baae5",
      "pledge": "1000000",
      "cost": "340000000",
      "margin": 0.01935,
      "rewardAccount": "e1aaba5c420ee082c1ed96e838dc21b1b3ba700bfc74425f816c0ceaca",
      "poolOwners": ["1f6aa9c55c35acd337ddd469b7e98dbea4f4a4c1d141ae2baf87a75c"],
      "relays": [{
        "ipv4": null,
        "ipv6": null,
        "dnsName": "cardano-relay.stakhanovite.io",
        "dnsSrvName": null,
        "port": "7001"
      }],
      "poolMetadata": {
        "url": "https://www.stakhanovite.io/cardano/stkh1.json",
        "metadataHash": "6a36f7a02d5895a082ffcbc1eb8c35f1e88192b8a0f27f07fb12555c7d1d1180"
      }
    }
  }
}];
