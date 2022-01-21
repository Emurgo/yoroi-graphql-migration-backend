import { utxoForTransactionsRequest } from "./data/utxoForTransactions";
import axios from "axios";
import { expect } from "chai";

import { config } from "./config";

const endpoint = config.apiUrl;
const testingApi = "txs/utxoForTransactions";

describe(testingApi, function () {
  this.timeout(10000);
  it("should return expected results", async function () {
    const postData = { transactions: utxoForTransactionsRequest };
    const result = await axios.post(`${endpoint}${testingApi}`, postData);

    expect(result.data).to.exist;
    expect(result.data).be.an("array");
    expect(result.data.length).to.be.equal(2);
    expect(result.data[0]).to.have.property("amount");
    expect(result.data[0]).to.have.property("block_num");
    expect(result.data[0]).to.have.property("tx_index");
    expect(result.data[0]).to.have.property("tx_hash");
    expect(result.data[0].tx_hash).to.be.an("string");
    expect(result.data[0].amount).to.be.equal("227600000");
    expect(result.data[0].block_num).to.be.equal(6750594);
    expect(result.data[0].tx_index).to.be.equal(2);
  });
});
