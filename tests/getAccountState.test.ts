import axios from "axios";
import { expect } from "chai";
import { config, } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "account/state";

const realAddresses = ["e15e8600926ab1856e52bf2f2960def3bc59f7ffa5c4162a578ddd264b", "e1b48e1d28ae9d4ea604ec265551d177cd2b5ccb18818c7f1b70cfd42a"];
const fakeAddress = "blahblah";
const realAddress = "e15e8600926ab1856e52bf2f2960def3bc59f7ffa5c4162a578ddd264b";
const mixedAddresses = [fakeAddress, realAddress];

describe("/account/state", function() {
  it("should return 0 rewards for addresses that have withdrawn everything", async() => {
    const result = await axios({method: "post", url: testableUri, data: {addresses: realAddresses}});
    for(const addr of realAddresses) {
      expect(result.data[addr].rewards).to.not.be.equal("0");
      expect(result.data[addr].withdrawals).to.not.be.equal("0");
    }
    expect(result.data).not.be.empty;
  });
  it("should return null for invalid addresses or addresses that have no rewards", async() => {
    const result = await axios({method: "post", url: testableUri, data: {addresses: mixedAddresses}});
    expect(result.data).to.have.property(fakeAddress);
    expect(result.data).to.have.property(realAddress);
    expect(result.data[fakeAddress]).to.be.a("null");
    expect(result.data[realAddress]).to.have.property("remainingAmount");
  });
});
