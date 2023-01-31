import axios from "axios";
import { expect, should } from "chai";
import { config } from "./config";

const endpoint = config.apiUrl + "v2.1/lastBlockBySlot";
const s = should();

const data = {
  slot1: {
    slot: [0, 10_004],
    hash: "a1b0c8626703d6a746de8565ea3360b82f8b3e4230922578c629275ec5b93257",
  },
  slot2: {
    slot: [32, 170_680],
    hash: "7984bc3c8b96be0826c5034135f316428212060631706d7c3263854be3dc529f",
  },
  slot3: {
    slot: [-10, 100_000],
    hash: null,
  },
};

describe("/v2.1/lastBlockBySlot", function () {
  this.timeout(10000);

  it("should return valid response", async function () {
    const result = await axios.post(endpoint, {
      slots: [data.slot1.slot, data.slot2.slot, data.slot3.slot],
    });
    s.exist(result.data);
    result.data.should.be.an("object");
    result.data.blockHashes.should.be.an("object");
    result.data.blockHashes[data.slot1.slot.join(",")].should.be.equal(
      data.slot1.hash
    );
    result.data.blockHashes[data.slot2.slot.join(",")].should.be.equal(
      data.slot2.hash
    );
    expect(result.data.blockHashes[data.slot3.slot.join(",")]).to.be.null;
  });

  it("should return error of empty request", async function () {
    try {
      await axios.post(endpoint, {});

      throw new Error("Unexpected response");
    } catch (e) {
      if (axios.isAxiosError(e)) {
        expect(e.response).to.have.property("status", 400);
        expect(e.response).to.has.property("data");
        expect(e.response?.data.error).to.be.equal(
          "Missing 'slots' in the request body"
        );
        return;
      }

      console.log(e);
      throw e;
    }
  });

  it("should return `slots` required to be an array", async function () {
    try {
      await axios.post(endpoint, {
        slots: {},
      });
      throw new Error("Unexpected response");
    } catch (e) {
      if (axios.isAxiosError(e)) {
        expect(e.response).to.have.property("status", 400);
        expect(e.response).to.has.property("data");
        expect(e.response?.data.error).to.be.equal(
          "'slots' is required to be an array"
        );
        return;
      }

      console.log(e);
      throw e;
    }
  });

  it("should return `slots` required to be a non-empty array ", async function () {
    try {
      await axios.post(endpoint, {
        slots: [],
      });
      throw new Error("Unexpected response");
    } catch (e) {
      if (axios.isAxiosError(e)) {
        expect(e.response).to.have.property("status", 400);
        expect(e.response).to.has.property("data");
        expect(e.response?.data.error).to.be.equal(
          "'slots' is required to be non-empty"
        );
        return;
      }

      console.log(e);
      throw e;
    }
  });

  it("should return max number of slots is 50", async function () {
    try {
      await axios.post(endpoint, {
        slots: new Array(100).fill([1, 2]),
      });
      throw new Error("Unexpected response");
    } catch (e) {
      if (axios.isAxiosError(e)) {
        expect(e.response).to.have.property("status", 400);
        expect(e.response).to.has.property("data");
        expect(e.response?.data.error).to.be.equal(
          "The maximum number of slots allowed is 50"
        );
        return;
      }

      console.log(e);
      throw e;
    }
  });

  it("should return error response for in valid slot entry", async function () {
    try {
      await axios.post(endpoint, {
        slots: [
          [1, 2],
          ["invlid input", 12],
        ],
      });
      throw new Error("Unexpected response");
    } catch (e) {
      if (axios.isAxiosError(e)) {
        expect(e.response).to.have.property("status", 400);
        expect(e.response).to.has.property("data");
        expect(e.response?.data.error).to.be.equal(
          "Each slot entry should be a tuple of two numbers: epoch and slot."
        );
        return;
      }

      console.log(e);
      throw e;
    }
  });
});