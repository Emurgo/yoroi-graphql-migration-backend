import axios from "axios";
import { config, } from "./config";
import { expect } from "chai";

const endpoint = config.apiUrl;

const testableUri = endpoint + "multiAsset/metadata";

describe("/multiAsset/metadata", function() {
  this.timeout(10000);
  it("returns", async() => {
      const spaceBudzPolicyId = "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc";
      const SpaceBud2589 = "537061636542756432353839"; // note: hexencoding
    const result = await axios({
        method: "post",
        url: testableUri,
        data: {
            policyIdAssetMap: {
                [spaceBudzPolicyId]: [SpaceBud2589]
            }
        }
    });
    
    expect(result.data).to.have.property("data");
    expect(result.data.data).to.have.property(spaceBudzPolicyId);
    expect(result.data.data[spaceBudzPolicyId]).to.have.property(SpaceBud2589);
    expect(result.data.data[spaceBudzPolicyId][SpaceBud2589]).to.be.eql({
        name: "SpaceBud #2589",
        imageUrl: "ipfs://QmTHaFdaj8hSjf3Xo9gFGxEvpgLX6CHCddbaGbzK4WbYz6",
        policy: "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc"
    });
  });
});
