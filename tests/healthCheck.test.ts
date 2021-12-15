import axios from "axios";
import { expect } from "chai";
import { config, } from "./config";

import { UtilEither } from "../src/utils";

import { CardanoFrag } from "../src/Transactions/types";
import { HealthChecker } from "../src/HealthChecker";

const endpoint = config.apiUrl;

describe("/importerhealthcheck", function() {
  this.timeout(10000);
  it("returns", async function() {
    const result = await axios.get(endpoint+"v2/importerhealthcheck");
    expect(result.data).to.have.property("message");
    expect(result.data.message).to.be.eql("Importer is OK");
  });
  it("fails for broken graphql api", async function () {
    const badFunc = async () : Promise<UtilEither<CardanoFrag>> => {
      return { kind: "error", errMsg: "haha I don't work" };

    };
    const healthChecker = new HealthChecker(badFunc);
    const status = healthChecker.getStatus();
    expect(status).to.not.be.eql("OK");


  }); 
});
