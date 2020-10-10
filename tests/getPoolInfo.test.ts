import axios from "axios";
import { expect } from "chai";
import { config, } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "getPoolInfo";

const realPoolId = "1b268f4cba3faa7e36d8a0cc4adca2096fb856119412ee7330f692b5"; // note: this pool has changed its metadata at least once
const fakePoolId = "00000000000000000000000000000000000000000000000000000001";
const privatePool = "b1fe7ac3669604156c20dcfc08355197af5637c37750d862039670c4";

describe("/getPoolInfo", function() {
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
});
