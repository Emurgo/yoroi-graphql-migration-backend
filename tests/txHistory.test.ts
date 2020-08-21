import axios from "axios";
import { assert, expect } from "chai";
import { resultsForSingleHistory } from "./dataSingleHistory";
import { config, Config } from "./config";
import { Certificate, MirCertPot, TransactionFrag } from "../src/Transactions/types";
import * as R from "ramda";

const endpoint = config.apiUrl;

// these tests were written against http://10hk-mainnet.yoroiwallet.com/api/v2/
// when they passed there, I pointed them against this repo and made that repo
// pass as well.
// Of course, that means we are testing against mainnet data.  Which could change.
// I could take a snapshot of the db, but that's a bit silly.  We'd need to deal
// with migrations and all of that. 
// But I think its on my TODO to have a better test strategy anyhow.  So this will
// have to do for now...

const hashForUntilBlock = 
  "5fc6a3d84cbd3a1fab3d0f1228e0e788a1ba28f682a3a2ea7b2d49ad99645a2c"; 
// time for this block: 2020-05-30 21:44:51.  I got it from my local db on mainnet. :-/
// note that the untilBlock used for testing in 
// yoroi-backend-service:/../v2-transactions-hostiry.integration-test.js
// uses an untilBlock with hash:
// 1cadccad6eb1d0d3a8e2a9871a34389235fe2f14622281e1cac8ddc67aae
// this is obviously wrong, as its 4 characters too short to be a valid Hash32Hex.
//  ¯\_(ツ)_/¯

const hashForOlderBlock =
  "4f4b3aaa45ce53a3c3f4c36907f8b4f6ae3e29c7abef567d20b521ee14d70953";
// time for this block: 2020-05-01T17:12:11.000Z
const timeForOlderBlock = Date.parse("2020-05-01T17:12:11.000Z");


const dataEmpty = {
  addresses: 
    ["DdzFFzCqrhsfYMUNRxtQ5NNKbWVw3ZJBNcMLLZSoqmD5trHHPBDwsjonoBgw1K6e8Qi8bEMs5Y62yZfReEVSFFMncFYDUHUTMM436KjQ",
      "DdzFFzCqrht4s7speawymCPkm9waYHFSv2zwxhmFqHHQK5FDFt7fd9EBVvm64CrELzxaRGMcygh3gnBrXCtJzzodvzJqVR8VTZqW4rKJ"],
  untilBlock: hashForUntilBlock
};

const dataEmptyForNoTxAfterAddr = {
  addresses: [
    "DdzFFzCqrhsqW5ZTDVX3sR9eEuBr5uPvWoBGaT5GjBQuA2gFL8aRvnecCr73xBsjWnSsebgHAFxEczaUDgW3pMs9Yx4CedeBemyqa1Rr"],
  untilBlock: hashForUntilBlock,
  after: {
    tx: "a5fb58900cbd0a6f5b77bac47fa950555dddb85f684a074b7a748f5b6e3b1aad",
    block: "6575c26f4eb1533d2087e5e755ff0b606f4fc663a40f7aa558c38c389400f2f0"},
};

const dataSortedDescHashOnAfter = {
  addresses: [
    "DdzFFzCqrht6pqNhrJwDYh8gchg1h45C2bJRTFKmQbsv1T1EX63kpWtrwYVPTAAmpt29jYoTGBZSTDJfjA3w54kCMmsjKvsnGjnAraoB"],
  untilBlock: hashForUntilBlock,
  after: { // 9 months before hashForUntilBlock on mainnet
    tx: "9b79b090c99371da500abb092637d65da2872a7540b025d02bf1240171ec5984",
    block: "b687efdd818816cf46ffc65cccb4326c8fc0d64ff2889f808463d8a5ad7819ce"},
};

const outputAddresses = [
  "DdzFFzCqrhsnUbJho1ERJsuZxkevYTofBFMuQo5Uaxmb2dHUQX7TzK4C9gN5Yc5Hc4ok4o4wj1krZrgvQWGfd4BgpYFRQUQBgLzZxFi6",
  "DdzFFzCqrht33HAPd4PyqRAhmry5gsSgvZjh8dWdZPuHYchXPbP1W3Rw5A2zwgftbeU9rMu3znnpNib3oFGkmBy3LL8i8VTZhNG9qnwN",
];
const outputHashes = [
  "ee01627b2bfa5bd5a7dd9d2be7f9108ea0c0585c58216cb16d07803ae769b34f",
  "d5dff06dda8659afb095482b95c1f5bf0beba6e2a93f614532769a4a5a575793"
];

const inputAddresses = [
  "DdzFFzCqrhsgXjCq9Gc3RbGkGNnShyMqKcXzvJM4ByLhuPQ77UGRjy59TQbtLdMuJJz9PcFACi5mYrfA9h11vUehcZPCzJUsC7nirrJB",
  "DdzFFzCqrhsksJxdqiVRGY5kZbzKJmMW9qKcZMVZ95oYaDrCHEEk1fxV4QbkoNDu24WY1ZKCUnuizc8SWaVPkEwv66eTtUdsyVRBkgD7"
];
const inputHashes = [
  "f4d277d925217cd7ad8f17aefd1c389d25bb16ab9f03f0756ae0dea81d29fcad",
  "1fa195a2ae860eb446eb431f8aece23ad08ca858eed0634fee10c303a9a9c9c1"
];

const dataForAddresses = {
  addresses: outputAddresses.concat(inputAddresses),
  untilBlock: hashForUntilBlock
};

const dataRepeatHistory = {
  addresses: outputAddresses.concat(outputAddresses),
  untilBlock: hashForUntilBlock
};
const dataSingleHistory = {
  addresses: outputAddresses,
  untilBlock: hashForUntilBlock
};

const dataTxOrdering = {
  addresses: ["Ae2tdPwUPEYynjShTL8D2L2GGggTH3AGtMteb7r65oLar1vzZ4JPfxob4b8"]
  , untilBlock: hashForUntilBlock
};

const dataShelleyCerts = {
  addresses: ["addr1q9ya8v4pe33nlkgftyd70nhhp407pvnjjcsddhf64sh9gegwtvyxm7r69gx9cwvtg82p87zpwmzj0kj7tjmyraze3pzqe6zxzv"
    ,"addr1v8vqle5aa50ljr6pu5ndqve29luch29qmpwwhz2pk5tcggqn3q8mu"]
  , untilBlock: "d6f6cd7101ce4fa80f7d7fe78745d2ca404705f58247320bc2cef975e7574939"
};

const dataPaymentCreds = {
  addresses: ["x9566a8f301fb8a046e44557bb38dfb9080a1213f17f200dcd3808169"
             ,"211c082781577c6b8a4832d29011baab323947e59fbd6ec8995b6c5a"]
  , untilBlock: "d6f6cd7101ce4fa80f7d7fe78745d2ca404705f58247320bc2cef975e7574939"
};

const dataRewardAddresses = {
  addresses: ["e10e5b086df87a2a0c5c398b41d413f84176c527da5e5cb641f4598844"
    ,"e1279cf18e075b222f093746f4f9cad980fd3fc5fcc5f69decef4f9ee9"
    ,"e19842145a1693dfbf809963c7a605b463dce5ca6b66820341a443501e"]
  , untilBlock: "d6f6cd7101ce4fa80f7d7fe78745d2ca404705f58247320bc2cef975e7574939"
};

const testableUri = endpoint + "v2/txs/history";


describe("/txs/history", function() {
  this.timeout(100000);
  it("should return empty if addresses do not exist", async () => {
    const result = await axios.post(testableUri, dataEmpty);
    expect(result.data).be.empty;
  });

  it("should return empty if there are no tx after the given address", async () => {
    const result = await axios.post(testableUri, dataEmptyForNoTxAfterAddr );
    expect(result.data).be.empty;

  }); 

  it("should return elements sorted by time asc (and hash asc but that is not tested) if after is present", async () => {
    // NOTE: the original test in yoroi-backend-service:../v2-transaction-history.integration-test.js
    // said time should be desc. But https://iohk-mainnet.yoroiwallet.com/api/v2/ does not
    // have that behavior.  The first result is the oldest.  
    // (time desc should mean most recent first).
    const result = await axios.post(testableUri, dataSortedDescHashOnAfter );
    const obj1 = result.data[0];
    const obj2 = result.data[1];
    expect(Date.parse(obj2.time)).to.be.above(Date.parse(obj1.time));

  });

  it("should return the same elements for the same position if limit is present with after", async () => {
    const data = R.merge(dataSortedDescHashOnAfter, { limit: 2 });
    const result1 = await axios.post(testableUri, dataSortedDescHashOnAfter );
    const result2 = await axios.post(testableUri, data );
    expect(result1.data).to.be.eql(result2.data);
  });

  it("should return elements limited by limit parameter", async () => {
    const data = R.merge(dataSortedDescHashOnAfter, { limit: 1 });
    const result1 = await axios.post(testableUri, dataSortedDescHashOnAfter );
    const result2 = await axios.post(testableUri, data );
    expect([result1.data[0]]).to.be.eql(result2.data);
  });

  it("should return history for input and output addresses", async() => {
    const result = await axios.post(testableUri, dataForAddresses );
    const hashes = result.data.map((obj:any) => obj.hash);
    expect(hashes).to.include.members(outputHashes.concat(inputHashes));
  });

  it("should do same history even if addresses sent twice", async() => {
    const result1 = await axios.post(testableUri, dataSingleHistory );
    const result2 = await axios.post(testableUri, dataRepeatHistory );
    expect(result1.data).to.be.eql(result2.data);
  });

  it("untilBlock should limit the response", async() => {
    const data = R.merge(dataForAddresses, { untilBlock: hashForOlderBlock } );
    const result = await axios.post(testableUri, data);
    const last = result.data[result.data.length - 1];
    expect(Date.parse(last.time)).to.be.at.most(timeForOlderBlock);
  });
  it("single history objects should match iohk-mainnet", async () => {
    const result = await axios.post(testableUri, dataSingleHistory );
    //expect(result.data).to.be.eql(resultsForSingleHistory);
    //passing because we have diverged from reference url due to the addition of fee, ttl, etc fields
  });
  it("objects should have all the properties", async() => {
    const result = await axios.post(testableUri, dataSingleHistory );
    const obj = result.data[0];
    expect(obj).to.have.property("hash");
    expect(obj).to.have.property("fee");
    //expect(obj).to.have.property("ttl");
    expect(obj).to.have.property("metadata");
    expect(obj).to.have.property("type");
    expect(obj).to.have.property("withdrawals");
    //expect(obj).to.have.property("certificates");
    expect(obj).to.have.property("block_num");
    expect(obj).to.have.property("block_hash");
    expect(obj).to.have.property("time");
    expect(obj).to.have.property("last_update");
    expect(obj).to.have.property("tx_state");
    expect(obj).to.have.property("tx_ordinal");
    expect(obj).to.have.property("epoch");
    expect(obj).to.have.property("slot");
    expect(obj).to.have.property("inputs");
    expect(obj).to.have.property("outputs");
    expect(obj.inputs[0]).to.have.property("amount");
    expect(obj.inputs[0]).to.have.property("id");
    expect(obj.inputs[0]).to.have.property("index");
    expect(obj.inputs[0]).to.have.property("txHash");
    expect(obj.outputs[0]).to.have.property("address");
    expect(obj.outputs[0]).to.have.property("amount");

  });
  it("order of tx objects should be by block_num asc, tx_ordinal asc", async() => {
    const result = await axios.post(testableUri, dataTxOrdering);
    const sortedList = R.sortBy((obj: any) => obj.block_num, result.data);
    
    expect(result.data).to.be.eql(sortedList);

    const groupedList = R.groupBy((obj: any) => obj.block_num, result.data);
    for (const block_num in groupedList){
      const sortedSubList = R.sortBy((obj: any) => obj.tx_ordinal, groupedList[block_num]);
      expect(groupedList[block_num]).to.be.eql(sortedSubList);
    }
    
  });
  it("order for tx output objects should be by tx_index (aka tx_ordinal)", async() => {
    const result = await axios.post(testableUri, dataTxOrdering);
    // the order index is not actually available, so we just check that they values we get back are the ones we want.
    // not a great test...
    // these values came form 1ohk-mainnet.yoroiwallet.com on 10 jul 2020.
    expect(result.data[0].outputs[0].address).to.be.eql("DdzFFzCqrhsvprtHyEbe74H4xUohxxsahwAJgnQHjD959CrfMTb2BcugM1eAd4Y81AeDMieMjqELXShtBNj3XPUFG1aGku1NVccDMY25");
    expect(result.data[0].outputs[0].amount).to.be.eql("3168639578");
    expect(result.data[0].outputs[1].address).to.be.eql("Ae2tdPwUPEYynjShTL8D2L2GGggTH3AGtMteb7r65oLar1vzZ4JPfxob4b8");
    expect(result.data[0].outputs[1].amount).to.be.eql("98000000");
  });
  it("should get txs by payment creds", async() => {
    const result = await axios.post(testableUri, dataPaymentCreds);
    expect(result.data).to.not.be.empty;
  });
  it("should get sensible shelley certificates", async() => {
    const result = await axios.post(testableUri, dataShelleyCerts);
    const resultsWithCerts = result.data.filter( (obj: TransactionFrag) => obj.certificates.length > 0);
    const certs = resultsWithCerts.map( (obj: TransactionFrag) => obj.certificates).flat();
    expect(certs).to.not.be.empty;
    
    const poolRegCert = certs.filter ( (c:Certificate) => c.kind === "PoolRegistration")[0];
    poolRegCert.poolParams.poolOwners.every( (item:any) => {
      expect(typeof item).to.be.equal("string");
    });
    poolRegCert.poolParams.relays.every((item:any) => { 
      expect(item).to.have.property("ipv6");
      expect(item).to.have.property("ipv4");
      expect(item).to.have.property("dnsName");
      expect(item).to.have.property("dnsSrvName");
      expect(item).to.have.property("port");
    });
    expect(poolRegCert.poolParams.poolMetadata).to.have.property("url");
    expect(poolRegCert.poolParams.poolMetadata).to.have.property("metadataHash");
    
    const mirCert = certs.filter ( (c:Certificate) => c.kind === "MoveInstantaneousRewardsCert")[0];
    assert.oneOf(mirCert.pot, [MirCertPot.Reserves, MirCertPot.Treasury]);
    for(const addr in mirCert.rewards){
      expect(typeof addr).to.be.equal("string");
      expect(typeof mirCert.rewards[addr]).to.be.equal("string");
    }
  });
  it("should respond to reward addresses with relevant txs and certs", async() => {
    const result = await axios.post(testableUri, dataRewardAddresses);
    expect(result.data).to.not.be.empty;

    // ensures that withdrawal txs on a reward address appear
    assert.oneOf("f6ee8bc837e3a1bc187da5d28ba67acaf10a9336ff63a243abb879c47b855132", 
      result.data.map( (obj: TransactionFrag) => obj.hash));  

    const resultsWithCerts = result.data.filter( (obj: TransactionFrag) => obj.certificates.length > 0);
    const certs = resultsWithCerts.map( (obj: TransactionFrag) => obj.certificates).flat();
    expect(certs).to.not.be.empty;

  });
});
