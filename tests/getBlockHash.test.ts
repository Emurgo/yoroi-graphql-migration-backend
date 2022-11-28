import axios from "axios";
import { expect, should } from "chai";
import { config } from "./config";

const endpoint = config.apiUrl + "v2.1/lastBlockBySlot";
const s = should();

const data = {
  slot1: {
    slot: [32, 12353044],
    hash: "7d6ecf29e2a834652d78c9ed3e1b7742c18ad64bf122b53fe9647de0fa538679",
  },
  slot2: {
    slot: [32, 12353055],
    hash: "05f00f274514b5e523867ac15058771336e64cd8da032c86eeb82e8aff4d8f72",
  },
  slot3: {
    slot: [132, 100000],
    hash: null,
  },
};

describe("/lastBlockBySlot", function () {
  this.timeout(10000);

  it("Should return valid response", async function () {
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

  it("Should return error of empty request", async function () {
    try {
      await axios.post(endpoint, {});
      throw new Error("Unexpected response");
    } catch (e) {
      expect(e.response).to.have.property("status", 400);
      expect(e.response).to.has.property("data");
      expect(e.response.data.error).to.be.equal(
        "Missing 'slots' in the request body"
      );
    }
  });

  it("Should return `slots` required to be an array", async function () {
    try {
      await axios.post(endpoint, {
        slots: {},
      });
      throw new Error("Unexpected response");
    } catch (e) {
      expect(e.response).to.have.property("status", 400);
      expect(e.response).to.has.property("data");
      expect(e.response.data.error).to.be.equal(
        "'slots' is required to be an array"
      );
    }
  });

  it("Should return `slots` required to be a non-empty array ", async function () {
    try {
      await axios.post(endpoint, {
        slots: [],
      });
      throw new Error("Unexpected response");
    } catch (e) {
      expect(e.response).to.have.property("status", 400);
      expect(e.response).to.has.property("data");
      expect(e.response.data.error).to.be.equal(
        "'slots' is required to be non-empty"
      );
    }
  });

  it("Should return max number of slots is 50", async function () {
    try {
      await axios.post(endpoint, {
        slots: new Array(100).fill([1, 2]),
      });
      throw new Error("Unexpected response");
    } catch (e) {
      expect(e.response).to.have.property("status", 400);
      expect(e.response).to.has.property("data");
      expect(e.response.data.error).to.be.equal(
        "The maximum number of slots allowed is 50"
      );
    }
  });

  it("Should return error response for in valid slot entry", async function () {

    try {
      await axios.post(endpoint, {
        slots: [
          [1, 2],
          ["invlid input", 12],
        ],
      });
      throw new Error("Unexpected response");
    } catch (e) {
      expect(e.response).to.have.property("status", 400);
      expect(e.response).to.has.property("data");
      expect(e.response.data.error).to.be.equal(
        "Each slot entry should be a tuple of two numbers: epoch and slot."
      );
    }
  });
});
