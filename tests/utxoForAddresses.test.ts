import axios from "axios";
import { expect, should } from "chai";

import { config, } from "./config";

const endpoint = config.apiUrl;
const s = should();

const add1 = "DdzFFzCqrht4wFnWC5TJA5UUVE54JC9xZWq589iKyCrWa6hek3KKevyaXzQt6FsdunbkZGzBFQhwZi1MDpijwRoC7kj1MkEPh2Uu5Ssz";

const enterpriseAddresses = "615c619e192407b2e972f04f0dda7c52aa8013d45ee7ba69d57041cad0";

const addresses = 
    [ "DdzFFzCqrht4wFnWC5TJA5UUVE54JC9xZWq589iKyCrWa6hek3KKevyaXzQt6FsdunbkZGzBFQhwZi1MDpijwRoC7kj1MkEPh2Uu5Ssz",
      "DdzFFzCqrhtBBX4VvncQ6Zxn8UHawaqSB4jf9EELRBuWUT9gZTmCDWCNTVMotEdof1g26qbrDc8qcHZvtntxR4FaBN1iKxQ5ttjZSZoj",
      "DdzFFzCqrht62k6YFcieBUwxkq2CLSi4Pdvt3bd6ghq5P7fTgp8n5pRyQK45gN8A2Udyaj9mFRdK1eUoxy1QjcU5AuCix5uJB3zdBgkf",
      "Ae2tdPwUPEZ1zsFUP2eYpyRJooGpYSBzR1jZsdK6ioAqR9vUcBiwQgyeRfB",
      "DdzFFzCqrht2Hw9qp1YcqsMJfwjMXiJR46RXU8KFALErRXnjHnjwBPCP8FDjwgUQkZeGghu69YP71ZU67EDsXa5G3g8D2Kr5XZ7Jc42b"];

describe("/txs/utxoForAddresses", function() {
  this.timeout(10000);
  it("returns data", async function() {
    const postData = { addresses: addresses };
    const result = await axios.post(endpoint+"txs/utxoForAddresses", postData);
    s.exist(result.data);
    result.data.should.be.an("array");
  }); 
  it("add1 returns what is expected", async function() {
    const postData = { addresses: [add1] };
    const result = await axios.post(endpoint+"txs/utxoForAddresses", postData);
    expect(result.data[0]).to.have.property("amount");
    expect(result.data[0]).to.have.property("block_num");
    expect(result.data[0]).to.have.property("tx_index");
    expect(result.data[0]).to.have.property("tx_hash");
    expect(result.data[0].tx_hash).to.be.an("string");
    expect(result.data[0].amount).to.be.equal("200000");
    expect(result.data[0].block_num).to.be.equal(322087);
    expect(result.data[0].tx_index).to.be.equal(1);
  });
  it("enterprise addresses returns something non-trivial", async function() {
    const postData = { addresses: [enterpriseAddresses] };
    const result = await axios.post(endpoint+"txs/utxoForAddresses", postData);
    expect(result.data[0]).to.have.property("amount");
    expect(result.data[0]).to.have.property("block_num");
    expect(result.data[0]).to.have.property("tx_index");
    expect(result.data[0].amount).to.be.equal("4798568257");
    expect(result.data[0].block_num).to.be.equal(4490529);
    expect(result.data[0].tx_index).to.be.equal(1);
  });
});
