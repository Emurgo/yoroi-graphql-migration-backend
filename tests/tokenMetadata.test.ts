import axios from "axios";
import { config } from "./config";
import { expect } from "chai";
import { nftMetadataRequest, nftMetadataResponse } from "./data/nftMetadata";

const endpoint = config.apiUrl;

const testableUri = endpoint + "multiAsset/metadata";

describe("/multiAsset/metadata", function () {
  this.timeout(10000);
  it("returns", async () => {
    const result = await axios({
      method: "post",
      url: testableUri,
      data: {
        policyIdAssetMap: nftMetadataRequest,
      },
    });

    expect(result.data).to.have.property("data");
    const apiResponse = result.data.data;

    for (const policyID of Object.keys(nftMetadataRequest)) {
      expect(apiResponse).to.have.property(policyID);
      for (const assetNameHex of nftMetadataRequest[policyID]) {
        expect(apiResponse[policyID]).to.have.property(assetNameHex);
        expect(apiResponse[policyID][assetNameHex]).to.be.eql(
          nftMetadataResponse[policyID][assetNameHex]
        );
      }
    }
  });
});
