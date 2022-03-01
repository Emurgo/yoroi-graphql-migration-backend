import axios from "axios";
import { expect } from "chai";
import { config } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "oracles/getTickers";

const oracleAddress = [
  "addr1q85yx2w7ragn5sx6umgmtjpc3865s9sg59sz4rrh6f90kgwfwlzu3w8ttacqg89mkdgwshwnplj5c5n9f8dhp0h55q2q7qm63t",
];
const oracleAddresses = [
  "addr1q85yx2w7ragn5sx6umgmtjpc3865s9sg59sz4rrh6f90kgwfwlzu3w8ttacqg89mkdgwshwnplj5c5n9f8dhp0h55q2q7qm63t",
  "addr1v8w6wfzljnzdrwq6patkas35pgjzc3xlggpz70kaldsetcsrw3ep4",
];

describe("/oracles/getTickers", function () {
  it("should return tickers", async () => {
    const result = await axios({
      method: "post",
      url: testableUri,
      data: {
        addresses: oracleAddress,
      },
    });
    expect(result.data).not.be.empty;
    expect(result.data).to.have.property(oracleAddress[0]);
    expect(result.data[oracleAddress[0]]).to.be.an("array").that.is.not.empty;
    expect(result.data[oracleAddress[0]][0]).to.have.property("ticker");
    expect(result.data[oracleAddress[0]][0].ticker).to.be.a("string");
    expect(result.data[oracleAddress[0]][0].latestBlock).to.be.a("number");
  });

  it("should return multiple tickers", async () => {
    const result = await axios({
      method: "post",
      url: testableUri,
      data: {
        addresses: oracleAddresses,
      },
    });
    expect(result.data).not.be.empty;
    expect(result.data).to.have.property(oracleAddresses[1]);
    expect(result.data[oracleAddresses[1]]).to.be.an("array").that.is.not.empty;
    expect(result.data[oracleAddresses[1]][0]).to.have.property("ticker");
    expect(result.data[oracleAddresses[1]][0].ticker).to.be.a("string");
    expect(result.data[oracleAddresses[1]][0].latestBlock).to.be.a("number");
  });
});
