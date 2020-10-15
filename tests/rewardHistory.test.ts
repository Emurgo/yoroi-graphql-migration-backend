import axios from "axios";
import { expect } from "chai";
import { config, } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "getRewardHistory";

const realAddress = "e1c3892366f174a76af9252f78368f5747d3055ab3568ea3b6bf40b01e";
const fakeAddress = "I am fake";
const mixedAddresses = [fakeAddress, realAddress];

describe("/api/v2/account/rewards", function() {
  it("should return a pointer", async() => {
    const result = await axios({method: "post", url: testableUri, data: {addresses: [realAddress]}});
    expect(result.data).not.be.empty;
    expect(result.data).to.have.property(realAddress);

    console.log(result.data);

    // test that some subset matches what we expect
    let sum = 0;
    for (const epochReward of result.data[realAddress]) {
      if (epochReward.epoch >= 210 && epochReward.epoch <= 220) {
        sum += Number.parseInt(epochReward.reward, 10);
      }
    }
    expect(sum).to.equal(66012);
  });
  it("should return empty array for invalid addresses", async() => {
    const result = await axios({method: "post", url: testableUri, data: {addresses: mixedAddresses}});
    expect(result.data).to.have.property(fakeAddress);
    expect(result.data).to.have.property(realAddress);
    expect(result.data[fakeAddress]).to.be.an("array").that.is.empty;
    expect(result.data[realAddress]).to.be.an("array").that.is.not.empty;
  });
});
