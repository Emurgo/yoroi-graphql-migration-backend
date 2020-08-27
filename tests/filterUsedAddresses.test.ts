import axios from "axios";
import { expect } from "chai";
import { config, Config } from "./config";

const endpoint = config.apiUrl;

const addresses = 
    [ "DdzFFzCqrht4wFnWC5TJA5UUVE54JC9xZWq589iKyCrWa6hek3KKevyaXzQt6FsdunbkZGzBFQhwZi1MDpijwRoC7kj1MkEPh2Uu5Ssz",
      "DdzFFzCqrhtBBX4VvncQ6Zxn8UHawaqSB4jf9EELRBuWUT9gZTmCDWCNTVMotEdof1g26qbrDc8qcHZvtntxR4FaBN1iKxQ5ttjZSZoj",
      "DdzFFzCqrht62k6YFcieBUwxkq2CLSi4Pdvt3bd6ghq5P7fTgp8n5pRyQK45gN8A2Udyaj9mFRdK1eUoxy1QjcU5AuCix5uJB3zdBgkf",
      "Ae2tdPwUPEZ1zsFUP2eYpyRJooGpYSBzR1jZsdK6ioAqR9vUcBiwQgyeRfB",
      "DdzFFzCqrht2Hw9qp1YcqsMJfwjMXiJR46RXU8KFALErRXnjHnjwBPCP8FDjwgUQkZeGghu69YP71ZU67EDsXa5G3g8D2Kr5XZ7Jc42b"];
const paymentCred = "addr1q853jag05fyxhupr8ufv6kzyv9f83ylgt8shv33c83g990dz6mr9wv6tsd44m49c5tq42ec4z3q6m98tp55h0cpj278qguup0r";

const expectedResult = [
  "DdzFFzCqrht2Hw9qp1YcqsMJfwjMXiJR46RXU8KFALErRXnjHnjwBPCP8FDjwgUQkZeGghu69YP71ZU67EDsXa5G3g8D2Kr5XZ7Jc42b",
  "Ae2tdPwUPEZ1zsFUP2eYpyRJooGpYSBzR1jZsdK6ioAqR9vUcBiwQgyeRfB",
  "DdzFFzCqrht4wFnWC5TJA5UUVE54JC9xZWq589iKyCrWa6hek3KKevyaXzQt6FsdunbkZGzBFQhwZi1MDpijwRoC7kj1MkEPh2Uu5Ssz",
  "DdzFFzCqrht62k6YFcieBUwxkq2CLSi4Pdvt3bd6ghq5P7fTgp8n5pRyQK45gN8A2Udyaj9mFRdK1eUoxy1QjcU5AuCix5uJB3zdBgkf"
];

describe("/addresses/filterUsed", function() {
  it("returns", async function() {
    const postData = { addresses: addresses };
    const result = await axios.post(endpoint+"v2/addresses/filterUsed", postData);
    expect(result.data).to.be.an("array");
    expect(result.data.sort()).to.be.eql(expectedResult.sort());
  });
  it("can handle payment creds", async function () {
    const postData = { addresses: [paymentCred] };
    const result = await axios.post(endpoint+"v2/addresses/filterUsed", postData);
    expect(result.data).to.be.an("array");

  }); 
});
