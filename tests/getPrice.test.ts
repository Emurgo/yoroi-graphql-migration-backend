import axios from "axios";
import { expect } from "chai";
import { config } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "getPrice";

const tickerADA = "ADA";
const tickerInvalid = "potato";
const unitOfAccount = "USD";

describe("/getPrice", function () {
  it("should get ADA price", async () => {
    const result = await axios.post(testableUri, {
      from: [tickerADA],
      to: unitOfAccount,
    });
    expect(result.data).to.have.property(tickerADA);
    expect(result.data[tickerADA]).to.have.property("PRICE");
    expect(result.data[tickerADA]).to.have.property("LASTUPDATE");
    expect(result.data[tickerADA]).to.have.property("CHANGEPCT24HOUR");
    expect(result.data[tickerADA].PRICE).to.be.greaterThan(0);
    expect(result.data[tickerADA].LASTUPDATE).to.be.greaterThan(0);
    expect(result.data[tickerADA].CHANGEPCT24HOUR).not.to.be.eq(0);
  });

  it("should not crash on invalid token", async () => {
    const result = await axios.post(testableUri, {
      from: [tickerADA],
      to: unitOfAccount,
    });
    expect(result.status).to.be.ok;
    expect(result.data[tickerInvalid]).to.be.undefined;
    expect(result.data).to.have.property(tickerADA);
  });
});
