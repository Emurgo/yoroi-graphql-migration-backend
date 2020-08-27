import axios from "axios";
import { expect } from "chai";
import { config, } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "getRegistrationHistory";

const realAddress = "e10408e68eafe1a57cf99a2793787a22dbb908d7d57c9976c440cbfc68";
const fakeAddress = "I am fake";
const mixedAddresses = [fakeAddress, realAddress];

describe("/getRegistrationHistory", function() {
  it("should return a pointer", async() => {
    const result = await axios({method: "post", url: testableUri, data: {addresses: [realAddress]}});
    expect(result.data).not.be.empty;
    expect(result.data).to.have.property(realAddress);
    expect(result.data[realAddress]).to.be.an("array").that.is.not.empty;
    expect(result.data[realAddress][0]).to.have.property("slot");
    expect(result.data[realAddress][0]).to.have.property("txIndex");
    expect(result.data[realAddress][0]).to.have.property("certIndex");
    expect(result.data[realAddress][0]).to.have.property("certType");
    expect(result.data[realAddress][0].slot).to.be.equal(4494060);
    expect(result.data[realAddress][0].txIndex).to.be.equal(5);
    expect(result.data[realAddress][0].certIndex).to.be.equal(0);
    expect(result.data[realAddress][0].certType).to.be.equal("StakeRegistration");
  });
  it("should return null for invalid addresses", async() => {
    const result = await axios({method: "post", url: testableUri, data: {addresses: mixedAddresses}});
    expect(result.data).to.have.property(fakeAddress);
    expect(result.data).to.have.property(realAddress);
    expect(result.data[fakeAddress]).to.be.an("array").that.is.empty;
    expect(result.data[realAddress]).to.be.an("array").that.is.not.empty;

  });
});
