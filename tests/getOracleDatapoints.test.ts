import axios from "axios";
import { expect } from "chai";
import { config } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "oracles/getDatapoints";

const oracleAddress = [
  "addr1q85yx2w7ragn5sx6umgmtjpc3865s9sg59sz4rrh6f90kgwfwlzu3w8ttacqg89mkdgwshwnplj5c5n9f8dhp0h55q2q7qm63t",
];
const block = 5746926;
const oracleAddresses = [
  "addr1q85yx2w7ragn5sx6umgmtjpc3865s9sg59sz4rrh6f90kgwfwlzu3w8ttacqg89mkdgwshwnplj5c5n9f8dhp0h55q2q7qm63t",
  "addr1v8w6wfzljnzdrwq6patkas35pgjzc3xlggpz70kaldsetcsrw3ep4",
];
const count = 3;
const ticker = "ADAEUR";
const source = "coinGecko";

describe("/oracles/getDatapoints", function () {
  it("should return all latest datapoints", async () => {
    const result = await axios({
      method: "post",
      url: testableUri,
      data: {
        addresses: oracleAddress,
        count: count,
      },
    });
    expect(result.data).not.be.empty;
    expect(result.data).to.have.property(oracleAddress[0]);
    expect(result.data[oracleAddress[0]]).to.be.an("array").that.is.not.empty;
    expect(result.data[oracleAddress[0]][0]).to.have.property("blockDistance");
    expect(result.data[oracleAddress[0]][0]).to.have.property("blockNumber");
    expect(result.data[oracleAddress[0]][0]).to.have.property("txHash");
    expect(result.data[oracleAddress[0]][0]).to.have.property("txIndex");
    expect(result.data[oracleAddress[0]][0]).to.have.property("payload");

    expect(result.data[oracleAddress[0]][0].blockDistance).to.be.a("null");
    expect(result.data[oracleAddress[0]][0].blockNumber).to.be.a("number");
    expect(result.data[oracleAddress[0]][0].txHash).to.be.a("string");
    expect(result.data[oracleAddress[0]][0].txIndex).to.be.a("number");
  });
  it("should return all datapoints near a specific block", async () => {
    const result = await axios({
      method: "post",
      url: testableUri,
      data: {
        addresses: oracleAddresses,
        block: block,
        count: count,
      },
    });
    expect(result.data).not.be.empty;
    expect(result.data).to.have.property(oracleAddresses[1]);
    expect(result.data).to.have.property(oracleAddresses[0]);
    expect(result.data[oracleAddresses[0]]).to.be.an("array").that.is.not.empty;
    expect(result.data[oracleAddresses[1]]).to.be.an("array").that.is.not.empty;

    expect(result.data[oracleAddresses[0]][0]).to.have.property(
      "blockDistance"
    );
    expect(result.data[oracleAddresses[0]][0]).to.have.property("blockNumber");
    expect(result.data[oracleAddresses[0]][0]).to.have.property("txHash");
    expect(result.data[oracleAddresses[0]][0]).to.have.property("txIndex");
    expect(result.data[oracleAddresses[0]][0]).to.have.property("payload");

    expect(result.data[oracleAddresses[1]][0]).to.have.property(
      "blockDistance"
    );
    expect(result.data[oracleAddresses[1]][0]).to.have.property("blockNumber");
    expect(result.data[oracleAddresses[1]][0]).to.have.property("txHash");
    expect(result.data[oracleAddresses[1]][0]).to.have.property("txIndex");
    expect(result.data[oracleAddresses[1]][0]).to.have.property("payload");

    expect(result.data[oracleAddresses[0]][0].blockDistance).to.be.a("number");
    expect(result.data[oracleAddresses[0]][0].blockNumber).to.be.a("number");
    expect(result.data[oracleAddresses[0]][0].txHash).to.be.a("string");
    expect(result.data[oracleAddresses[0]][0].txIndex).to.be.a("number");

    expect(result.data[oracleAddresses[1]][0].blockDistance).to.be.a("number");
    expect(result.data[oracleAddresses[1]][0].blockNumber).to.be.a("number");
    expect(result.data[oracleAddresses[1]][0].txHash).to.be.a("string");
    expect(result.data[oracleAddresses[1]][0].txIndex).to.be.a("number");

    expect(
      result.data[oracleAddresses[0]][0].payload["ADABTC"][0].value
    ).to.be.equal("4.096e-05");
    expect(
      result.data[oracleAddresses[0]][0].payload["ADABTC"][0].source
    ).to.be.equal("coinGecko");
  });
  it("should return all sources of a specific ticker", async () => {
    const result = await axios({
      method: "post",
      url: testableUri,
      data: {
        addresses: oracleAddress,
        ticker: ticker,
        count: count,
      },
    });
    expect(result.data).not.be.empty;
    expect(result.data).to.have.property(oracleAddress[0]);
    expect(result.data[oracleAddress[0]]).to.be.an("array").that.is.not.empty;

    expect(result.data[oracleAddress[0]][0]).to.have.property("blockDistance");
    expect(result.data[oracleAddress[0]][0]).to.have.property("blockNumber");
    expect(result.data[oracleAddress[0]][0]).to.have.property("txHash");
    expect(result.data[oracleAddress[0]][0]).to.have.property("txIndex");
    expect(result.data[oracleAddress[0]][0]).to.have.property("payload");

    expect(result.data[oracleAddress[0]][0]).to.have.property("blockDistance");

    expect(result.data[oracleAddresses[0]][0].blockDistance).to.be.a("null");
    expect(result.data[oracleAddresses[0]][0].blockNumber).to.be.a("number");
    expect(result.data[oracleAddresses[0]][0].txHash).to.be.a("string");
    expect(result.data[oracleAddresses[0]][0].txIndex).to.be.a("number");

    expect(result.data[oracleAddresses[0]][0].payload[0].value).to.be.a(
      "string"
    );
    expect(result.data[oracleAddresses[0]][0].payload[0].source).to.be.a(
      "string"
    );
  });
  it("should return specific source of a specific ticker near a block", async () => {
    const result = await axios({
      method: "post",
      url: testableUri,
      data: {
        addresses: oracleAddresses,
        block: block,
        ticker: ticker,
        source: source,
        count: count,
      },
    });
    expect(result.data).not.be.empty;
    expect(result.data).to.have.property(oracleAddresses[1]);
    expect(result.data).to.have.property(oracleAddresses[0]);
    expect(result.data[oracleAddresses[0]]).to.be.an("array").that.is.not.empty;
    expect(result.data[oracleAddresses[1]]).to.be.an("array").that.is.not.empty;

    expect(result.data[oracleAddresses[0]][0]).to.have.property(
      "blockDistance"
    );
    expect(result.data[oracleAddresses[0]][0]).to.have.property("blockNumber");
    expect(result.data[oracleAddresses[0]][0]).to.have.property("txHash");
    expect(result.data[oracleAddresses[0]][0]).to.have.property("txIndex");
    expect(result.data[oracleAddresses[0]][0]).to.have.property("payload");

    expect(result.data[oracleAddresses[1]][0]).to.have.property(
      "blockDistance"
    );
    expect(result.data[oracleAddresses[1]][0]).to.have.property("blockNumber");
    expect(result.data[oracleAddresses[1]][0]).to.have.property("txHash");
    expect(result.data[oracleAddresses[1]][0]).to.have.property("txIndex");
    expect(result.data[oracleAddresses[1]][0]).to.have.property("payload");

    expect(result.data[oracleAddresses[0]][0].blockDistance).to.be.a("number");
    expect(result.data[oracleAddresses[0]][0].blockNumber).to.be.a("number");
    expect(result.data[oracleAddresses[0]][0].txHash).to.be.a("string");
    expect(result.data[oracleAddresses[0]][0].txIndex).to.be.a("number");

    expect(result.data[oracleAddresses[1]][0].blockDistance).to.be.a("number");
    expect(result.data[oracleAddresses[1]][0].blockNumber).to.be.a("number");
    expect(result.data[oracleAddresses[1]][0].txHash).to.be.a("string");
    expect(result.data[oracleAddresses[1]][0].txIndex).to.be.a("number");

    expect(result.data[oracleAddresses[0]][0].payload.value).to.be.equal(
      "1.37"
    );
    expect(result.data[oracleAddresses[0]][0].payload.source).to.be.equal(
      "coinGecko"
    );

    expect(result.data[oracleAddresses[1]][0].payload.value).to.be.equal(
      "1.36"
    );
    expect(result.data[oracleAddresses[1]][0].payload.source).to.be.equal(
      "coinGecko"
    );
  });
});
