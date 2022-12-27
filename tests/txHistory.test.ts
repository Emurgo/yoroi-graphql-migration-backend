import axios from "axios";
import { assert, expect } from "chai";
import { resultsForSingleHistory } from "./dataSingleHistory";
import { config, } from "./config";
import { Certificate, MirCertPot, TransactionFrag } from "../src/Transactions/types";
import * as R from "ramda";
import { bech32 } from "bech32";
import { Prefixes } from "../src/utils/cip5";

const { encode, toWords } = bech32;

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
  addresses: [
     "addr1q9ya8v4pe33nlkgftyd70nhhp407pvnjjcsddhf64sh9gegwtvyxm7r69gx9cwvtg82p87zpwmzj0kj7tjmyraze3pzqe6zxzv"
      // enterprise address
    ,"addr1v8vqle5aa50ljr6pu5ndqve29luch29qmpwwhz2pk5tcggqn3q8mu"
  ]
  , untilBlock: "d6f6cd7101ce4fa80f7d7fe78745d2ca404705f58247320bc2cef975e7574939"
};

const certificateRegistrationRewardAddresses = {
  addresses: [
    "e19842145a1693dfbf809963c7a605b463dce5ca6b66820341a443501e"
  ]
  , after: {
    tx: "a235a7bb9b92cd04bd3c445f5659c2f1d55b3c71b51a0b2718a06ffe56095c66",
    block: "55ee284def9e92a08246752a9e6c2d4143b94e86dc32b06eeb4db042a415a6f9",
  }
  , untilBlock: "7e75460322424b2fa77b4550090977c51d3342668ad688186c2443f292c2932b"
};
const certificateDelegationRewardAddresses = {
  addresses: [
    "e1c3892366f174a76af9252f78368f5747d3155ab3568ea3b6bf40b01e", // fake address
    "e1c3892366f174a76af9252f78368f5747d3055ab3568ea3b6bf40b01e"
  ]
  , after: {
    tx: "717ee5005ec1888b2b67195047d5d5d08a278fa52201d33686010c834cde24bd",
    block: "094ae9802b7e0a8cee97e88cc14a3029f8788d9cb9568ae32337e6ba2c0c1a5b",
  }
  , untilBlock: "fa0a6a6c3bea2a9dfae92ca2dfe89ec608ccf22f259e26d1e510503d74e7d3a0"
};

const certificateDeregistrationRewardAddresses = {
  addresses: [
    "e1aa377459e2cc1f7d81752f5a13e0eb1a4f85deebe8bb14bb1e157487"
  ]
  , after: {
    tx: "9f93abce0b293b01f62ce9c8b0257a3da8aef27de164a609c32c92dc0a04f58e",
    block: "3d85a2fca53596e3b91d031d1d675b64c3b85db235ead56e04e951debd1833ec",
  }
  , untilBlock: "8fe8cafa28015c57225dda10d780c61479679124674f3db6ae6572b38b8feee1"
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

  it("should throw reference errors for a until block that doesn't exist.", async() => {
    try {
      await axios.post(testableUri, {
        addresses: [
          "Ae2tdPwUPEZHu3NZa6kCwet2msq4xrBXKHBDvogFKwMsF18Jca8JHLRBas7"],
        untilBlock: "0000000000000000000000000000000000000000000000000000000000000000",
      });
      expect(1).to.be.equal(0); // equivalent to asset false
    } catch (err) {
      expect(err.response.status).to.be.equal(500);
      expect(err.response.data.error.response).to.be.equal("REFERENCE_BEST_BLOCK_MISMATCH");
    }
  });
  it("should throw reference errors for a tx that doesn't exist.", async() => {
    try {
      await axios.post(testableUri, {
        addresses: [
          "Ae2tdPwUPEZHu3NZa6kCwet2msq4xrBXKHBDvogFKwMsF18Jca8JHLRBas7"],
        untilBlock: hashForUntilBlock,
        after: {
          tx: "0000000000000000000000000000000000000000000000000000000000000000",
          block: "790eb4d6ef2fea7cceebf22c66c20518616d5331966f6f9b4ca3a308b9c3ceb1"},
      });
      expect(1).to.be.equal(0); // equivalent to asset false
    } catch (err) {
      expect(err.response.status).to.be.equal(500);
      expect(err.response.data.error.response).to.be.equal("REFERENCE_TX_NOT_FOUND");
    }
  });
  it("should throw reference errors for a tx that doesn't match the block in after.", async() => {
    try {
      await axios.post(testableUri, {
        addresses: [
          "Ae2tdPwUPEZHu3NZa6kCwet2msq4xrBXKHBDvogFKwMsF18Jca8JHLRBas7"],
        untilBlock: hashForUntilBlock,
        after: {
          tx: "9f93abce0b293b01f62ce9c8b0257a3da8aef27de164a609c32c92dc0a04f58e",
          block: "0000000000000000000000000000000000000000000000000000000000000000"},
      });
      expect(1).to.be.equal(0); // equivalent to asset false
    } catch (err) {
      expect(err.response.status).to.be.equal(500);
      expect(err.response.data.error.response).to.be.equal("REFERENCE_BLOCK_MISMATCH");
    }
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
  it("Pagination mid-block should be supported", async() => {
    const result = await axios.post(testableUri, {
      addresses: [
        "addr1q84shx6jr9s258r9m45ujeyde7u4z7tthkedezjm5kdr4um64gv6jqqncjd205c540fgu5450tzvu27n9lk8ulm3s99spva2ru"
      ]
      // make sure if we as for after txIndex 0, txIndex 1 is included in the response
      // AKA support pagination mid-block
      , after: {
        tx: "f07d7d5cb0126da7da9f6a067aee00fd42efae94891a42544abfd1759248019d",
        block: "728ceadf2d949281591175a6d1641f10f2307eff80eaf59c5300dbd4a5f83554",
      }
      // make sure untilBlock is inclusive
      , untilBlock: "728ceadf2d949281591175a6d1641f10f2307eff80eaf59c5300dbd4a5f83554"
    });
    expect(result.data).to.have.lengthOf(1);
    expect(result.data[0].hash).to.equal("00d6d64b251514c48a9ad75940c5e7031bae5f0d002e9be7f6caf4cc1a78b57f");
  });
  it("Transaction-era transactions should be marked properly", async() => {
    // Byron era
    {
      const result = await axios.post(testableUri, {
        addresses: [
          "Ae2tdPwUPEZLs4HtbuNey7tK4hTKrwNwYtGqp7bDfCy2WdR3P6735W5Yfpe"
        ]
        , after: {
          tx: "aef8aa952a11b1225f1c067824f38e0c4b6d478900db6b57f6503b81fbc09427",
          block: "07d8aee8a94c6a65b0a6dac7bb43e7f8ddb7320d3c7770db8b1be4fbd685c0aa",
        }
        , untilBlock: "187c5137b0c2660ad8277c843ddec0deede6da5c2ba50ac8b958127c328ddbee"
      });
      expect(result.data).to.have.lengthOf(1);
      expect(result.data[0].hash).to.equal("130f9c6f3dcb0af0733757b301c877ec63d5c127373e75268e8b20c09fa645df");
      expect(result.data[0].type).to.equal("byron");
    }
    // Shelley era
    {
      const result = await axios.post(testableUri, {
        addresses: [
          "addr1q9ya8v4pe33nlkgftyd70nhhp407pvnjjcsddhf64sh9gegwtvyxm7r69gx9cwvtg82p87zpwmzj0kj7tjmyraze3pzqe6zxzv"
        ]
        , untilBlock: "e99b06115fc0cd221671b686b6d9ef1c6dc047abed2c4f7d3ae528427a746f60"
      });
      expect(result.data).to.have.lengthOf(1);
      expect(result.data[0].hash).to.equal("871b14fbe5abb6cacc63f922187c4f10ea9499055a972eb5d3d4e8771af643df");
      expect(result.data[0].type).to.equal("shelley");
    }
  });
  it("untilBlock should limit the response", async() => {
    const data = R.merge(dataForAddresses, { untilBlock: hashForOlderBlock } );
    const result = await axios.post(testableUri, data);
    const last = result.data[result.data.length - 1];
    expect(Date.parse(last.time)).to.be.at.most(timeForOlderBlock);
  });
  it("single history objects should match iohk-mainnet", async () => {
    const result = await axios.post(testableUri, dataSingleHistory );
    expect(result.data).to.be.eql(resultsForSingleHistory);
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
    expect(obj.inputs[0]).to.have.property("assets");
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
  it("Get payment key that only occurs in input", async() => {
    const result = await axios.post(testableUri, {
      addresses: [
        encode(Prefixes.PAYMENT_KEY_HASH, toWords(Buffer.from("211c082781577c6b8a4832d29011baab323947e59fbd6ec8995b6c5a", "hex")))
      ]
      , after: {
        block: "b51b1605cc27b0be3a1ab07dfcc2ceb0b0da5e8ab5d0cb944c16366edba92e83",
        tx: "79acf08126546b68d0464417af9530473b8c56c63b2a937bf6451e96e55cb96a",
      }, untilBlock: "f0d4b1eed671770194a223eaba3fc0cb0b6787d83c432ec5c24b83620c9b7474"
    });
    expect(result.data).to.have.lengthOf(1);
    expect(result.data[0].hash).to.equal("92bdc4f35fd9b363a4eac47898148fd1816efd4260d71e8251ca80dbb7a39ca3");
  });
  it("Get payment key that only occurs in output", async() => {
    const result = await axios.post(testableUri, {
      addresses: [
        encode(Prefixes.PAYMENT_KEY_HASH, toWords(Buffer.from("85abf3eca55024aa1c22b944599b5e890ec12dfb19941229da4ba293", "hex")))
      ]
      , untilBlock: "094ae9802b7e0a8cee97e88cc14a3029f8788d9cb9568ae32337e6ba2c0c1a5b"
    });
    expect(result.data).to.have.lengthOf(1);
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
  it("(deprecated) should respond to reward addresses with relevant witnesses", async() => {
    const result = await axios.post(testableUri, {
      addresses: [
        "e19842145a1693dfbf809963c7a605b463dce5ca6b66820341a443501e"
      ]
      , untilBlock: "d6f6cd7101ce4fa80f7d7fe78745d2ca404705f58247320bc2cef975e7574939"
    });
    expect(result.data).to.not.be.empty;

    // ensures that withdrawal txs on a reward address appear
    assert.oneOf(
      "f6ee8bc837e3a1bc187da5d28ba67acaf10a9336ff63a243abb879c47b855132", 
      result.data.map( (obj: TransactionFrag) => obj.hash)
    );
  });
  it("should respond to reward addresses with relevant witnesses", async() => {
    const result = await axios.post(testableUri, {
      addresses: [
        "stake1uxvyy9z6z6fal0uqn93u0fs9k33aeew2ddngyq6p53p4q8smzq4sz"
      ]
      , untilBlock: "d6f6cd7101ce4fa80f7d7fe78745d2ca404705f58247320bc2cef975e7574939"
    });
    expect(result.data).to.not.be.empty;

    // ensures that withdrawal txs on a reward address appear
    assert.oneOf(
      "f6ee8bc837e3a1bc187da5d28ba67acaf10a9336ff63a243abb879c47b855132", 
      result.data.map( (obj: TransactionFrag) => obj.hash)
    );
  });
  it("should respond to reward addresses with relevant certificates", async() => {
    // registration cert
    {
      const result = await axios.post(testableUri, certificateRegistrationRewardAddresses);

      expect(result.data).to.have.lengthOf(1);
      expect(result.data[0].hash).to.equal("e130a413db6f78b585e6a674e4e0241f770d8fcf82dcaa79922ee265b8a5145d");
      expect(result.data[0].certificates[0].kind).to.equal("StakeRegistration");
    }
    // delegation cert
    {
      const result = await axios.post(testableUri, certificateDelegationRewardAddresses);

      expect(result.data).to.have.lengthOf(1);
      expect(result.data[0].hash).to.equal("b84471f9dda4e5381f8986b0db8cfe9ebaf88472c68076af326d88b46ae915e7");
      expect(result.data[0].certificates[0].kind).to.equal("StakeDelegation");

      const resultsWithCerts = result.data.filter( (obj: TransactionFrag) => obj.certificates.length > 0);
      const certs = resultsWithCerts.map( (obj: TransactionFrag) => obj.certificates).flat();
      expect(certs).to.not.be.empty;
    }
    // deregistration cert
    {
      const result = await axios.post(testableUri, certificateDeregistrationRewardAddresses);

      expect(result.data).to.have.lengthOf(1);
      expect(result.data[0].hash).to.equal("c7eecab99bb1879388c133baadb78f89268beb1be3907a71b5749009a8bc4206");
      expect(result.data[0].certificates[0].kind).to.equal("StakeDeregistration");
    }
    // pool registration cert
    {
      const result = await axios.post(testableUri, {
        addresses: [
          "e17ee7b9a540f56912c3e6937f1ef819c8862c33efe80ab1605105aeae"
        ]
        , after: {
          tx: "b5a02c29a0ea54e1b371d63cd2997c922398d66a733a6701e7cb5aa6f59fbebb",
          block: "22f010b4aa18ad964dae9feac5407cbe453110ebd85fc977c9ffdb7a193a1378",
        }
        , untilBlock: "f094414de98d9c7e80ed8c29b14f5866bcbb648c2aee8e8869df89c23c45fe25"
      });
      expect(result.data).to.not.be.empty;

      expect(result.data).to.have.lengthOf(1);
      expect(result.data[0].hash).to.equal("477b17052e518e8b225f05b9c474057ee25cc6e7c68fcb044b518025b4995e02");
      expect(result.data[0].certificates[0].kind).to.equal("PoolRegistration");
    }
  });
  it("Get metadata for transaction", async() => {
    // tx that only has a single metadata entry
    const singleMetadataTx = await axios.post(testableUri, {
      addresses: [
        encode(Prefixes.PAYMENT_KEY_HASH, toWords(Buffer.from("69f6f57453031d04bd71a08cd3f31e7d61bfa939037f0e547de850e3", "hex")))
      ]
      , untilBlock: "d9038b728b997566b4b5fd2686ed2268505f50c8faa1292837fede6ef42cdab5"
      , after: {
          tx: "0e06078128b5126c77cf6ffe68eab7d0d51423cba84f24d34c433752ff0c843b"
        , block: "7b483248865efe366af230a68952340ec2a5868433a3323abfff433699997175"
      }
    });
    expect(singleMetadataTx.data).to.have.lengthOf(1);
    expect(singleMetadataTx.data[0].hash).to.equal("4237501da3cfdd53ade91e8911e764bd0699d88fd43b12f44a1f459b89bc91be");
    expect(singleMetadataTx.data[0].metadata).to.equal("a100a16b436f6d62696e6174696f6e8601010101010c");
    
    // tx that only has multiple metadata entries
    const multiMetadataTx = await axios.post(testableUri, {
      addresses: [
        encode(Prefixes.PAYMENT_KEY_HASH, toWords(Buffer.from("89aa7bae5ad34eb20ad28a9ade1ab539fbb8e957bb6645e47434a537", "hex")))
      ]
      , untilBlock: "159a22318dd76531fb34fa0ddf33198755a444b6452ddbabfb651ef2148294f8"
      , after: {
          tx: "e7d3a4fdbed209623fb858e206176511c30f7880dc89d3801d1b33cacdfc3e1c"
        , block: "acf5ead409a27d4795f8a653a3ee6ba1550a7ea09331751a7aba3ba2fe3c47f0"
      }
    });
    expect(multiMetadataTx.data).to.have.lengthOf(1);
    expect(multiMetadataTx.data[0].hash).to.equal("f910021138e553c65b96cf3e4647927fcd9f634e06544251f83cffb1891876e8");
    expect(multiMetadataTx.data[0].metadata).to.equal("a200a16e4c615f52657073697374616e634568576173206865726501a56743686f6963657384a36b43616e6469646174654964782461616139353033612d366663352d343665612d396161302d62346339306633363161346368566f746552616e6b016a566f746557656967687401a36b43616e6469646174654964782438643634396331322d393336652d343662652d623635612d63313766333066353935373468566f746552616e6b026a566f746557656967687401a36b43616e6469646174654964782438316365376638652d393463332d343833352d393166632d32313436643531666131666368566f746552616e6b006a566f746557656967687400a36b43616e6469646174654964782434303735343061612d353862352d343063612d623438342d66343030343065623239393068566f746552616e6b036a566f746557656967687401694e6574776f726b49646f5468655265616c4164616d4465616e6a4f626a656374547970656a566f746542616c6c6f746a50726f706f73616c4964782438303036346332382d316230332d346631632d616266302d63613863356139386435623967566f7465724964782464393930613165382d636239302d346635392d623563662d613862353963396261386165");
  });

  it("Get treasury MIR", async() => {
    const catalystRewardTx = await axios.post(testableUri, {
      addresses: [
        "stake1uypy44wqjznc5w9ns9gsguz4ta83jekrg9d0wupa7j3zsacwvq5ex"
      ]
      , untilBlock: "b687d2012739687a3543c1ec4b47b899b5519c94299cd6537174467707b979ad"
      , after: {
          tx: "0e06078128b5126c77cf6ffe68eab7d0d51423cba84f24d34c433752ff0c843b"
        , block: "7b483248865efe366af230a68952340ec2a5868433a3323abfff433699997175"
      }
    });
    expect(catalystRewardTx.data).to.have.lengthOf(2);
  });
});
