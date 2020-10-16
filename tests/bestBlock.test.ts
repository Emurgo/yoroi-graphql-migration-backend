import axios from "axios";
import { should } from "chai";
import { config, } from "./config";

const endpoint = config.apiUrl;
const s = should();

describe("/bestblock", function() {
  this.timeout(10000);
  it("returns", async function() {
    const result = await axios.get(endpoint+"v2/bestblock");
    s.exist(result.data);
    result.data.should.be.an("object");
    result.data.slot.should.be.an("number");
    result.data.epoch.should.be.an("number");
    result.data.height.should.be.an("number");
    result.data.hash.should.be.an("string");
  }); 
});
