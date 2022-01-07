import axios from "axios";
import { config, } from "./config";
import { expect } from "chai";

const endpoint = config.apiUrl;

const testableUri = endpoint + "multiAsset/metadata";

describe("/multiAsset/metadata", function() {
  this.timeout(10000);
  it("returns", async() => {
    const spaceBudzNft = {
        policyId: "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc",
        // hex encoding (SpaceBud2589)
        assetName: "537061636542756432353839",
        result: {
            name: "SpaceBud #2589",
            imageUrl: "ipfs://QmTHaFdaj8hSjf3Xo9gFGxEvpgLX6CHCddbaGbzK4WbYz6",
            policy: "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc"
        }
    };

    const charlesNft = {
        policyId: "2a9f36ce07c7264420f46841a4019fa2c4b2ee3c0e3d50e48e5feea5",
        // hex encoding (CharlesHoskinson1211of100)
        assetName: "436861726c6573486f736b696e736f6e313231316f66313030",
        result: {
            "name": "Charles Hoskinson12-11of100",
            "imageUrl": "ipfs://Qmb3SmS88WHCBZ1NDz5yGGgPzGBJqUkyB5DqwNCF6WjX6W",
            "policy": "2a9f36ce07c7264420f46841a4019fa2c4b2ee3c0e3d50e48e5feea5"
        }
    };
    const result = await axios({
        method: "post",
        url: testableUri,
        data: {
            policyIdAssetMap: {
                [spaceBudzNft.policyId]: [spaceBudzNft.assetName],
                [charlesNft.policyId]: [charlesNft.assetName]
            }
        }
    });
    
    expect(result.data).to.have.property("data");

    for (const nft of [spaceBudzNft, charlesNft]) {
        expect(result.data.data).to.have.property(nft.policyId);
        expect(result.data.data[nft.policyId]).to.have.property(nft.assetName);
        expect(result.data.data[nft.policyId][nft.assetName]).to.be.eql(nft.result);
    }
  });
});
