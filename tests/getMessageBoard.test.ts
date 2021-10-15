import axios from "axios";
import { expect } from "chai";
import { config } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "messages/getMessageBoard";

const validPoolId = "0f292fcaa02b8b2f9b3c8f9fd8e0bb21abedb692a6d5058df3ef2735";
const fromBlock = "6157866";
const untilBlock = "6157866";
const invalidPoolId =
  "26b17b78de4f035dc0bfce60d1d3c3a8085c38dcce5fb8767e518bed";
const mixedPools = [validPoolId, invalidPoolId];

describe("/messages/getMessageBoard", function () {
  it("should return a message", async () => {
    const result = await axios({
      method: "post",
      url: testableUri,
      data: {
        poolIds: [validPoolId],
        fromBlock: fromBlock,
        untilBlock: untilBlock,
      },
    });
    expect(result.data).not.be.empty;
    expect(result.data).to.have.property(validPoolId);
    expect(result.data[validPoolId]).to.be.an("array").that.is.not.empty;
    expect(result.data[validPoolId][0].eng).to.have.property("block_no");
    expect(result.data[validPoolId][0].eng).to.have.property("title");
    expect(result.data[validPoolId][0].eng).to.have.property("content");
    expect(result.data[validPoolId][0].eng).to.have.property("valid");
    expect(result.data[validPoolId][0].eng).to.have.property("expire");

    expect(result.data[validPoolId][0].eng.block_no).to.be.equal(6157866);
    expect(result.data[validPoolId][0].eng.title).to.be.equal(
      "Welcome to NUTS!"
    );
    expect(result.data[validPoolId][0].eng.content).to.be.equal(
      "For more information, visit our website www.stakenuts.com."
    );
  });
  it("should return array for valid and empty array for invalid pool", async () => {
    const result = await axios({
      method: "post",
      url: testableUri,
      data: { poolIds: mixedPools },
    });
    expect(result.data).to.have.property(validPoolId);
    expect(result.data).to.have.property(invalidPoolId);
    expect(result.data[validPoolId]).to.be.an("array").that.is.not.empty;
    expect(result.data[invalidPoolId]).to.be.an("array").that.is.empty;
  });
});
