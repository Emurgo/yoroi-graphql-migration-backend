import axios from "axios";
import { expect, should } from "chai";
import { config } from "./config";

const endpoint = config.apiUrl + "v2.1/lastBlockBySlot";
const s = should();

const data = {
    slot1: {
        slot: [32, 12353044],
        hash: "7d6ecf29e2a834652d78c9ed3e1b7742c18ad64bf122b53fe9647de0fa538679"
    },
    slot2: {
        slot: [32, 12353055],
        hash: "05f00f274514b5e523867ac15058771336e64cd8da032c86eeb82e8aff4d8f72"
    },
    slot3: {
        slot: [132, 100000],
        hash: null,
    },
};


describe("/lastBlockBySlot", function () {
  this.timeout(10000);

  it("returns", async function () {
    const result = await axios.post(endpoint, {
      slots: [
        data.slot1.slot,
        data.slot2.slot,
        data.slot3.slot,
      ],
    });
    s.exist(result.data);
    result.data.should.be.an("object");
    result.data.blockHashes.should.be.an("object");
    result.data.blockHashes[data.slot1.slot.join(",")].should.be.equal(data.slot1.hash);
    result.data.blockHashes[data.slot2.slot.join(",")].should.be.equal(data.slot2.hash);
    expect(result.data.blockHashes[data.slot3.slot.join(",")]).to.be.null;
  });
});
