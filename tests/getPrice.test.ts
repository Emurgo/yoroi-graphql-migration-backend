import axios from "axios";
import { expect } from "chai";
import { config } from "./config";

const endpoint = config.apiUrl;
const testableUri = endpoint + "getPrice";

const tickerADA = "ADA";
const tickerInvalid = "potato";
const unitOfAccount = "USD";
const hourlySample = 100;
const dailySample = 1000;

describe("/getPrice", function () {
  it("should get ADA price", async () => {
    const result = await axios.post(testableUri, {
      from: [tickerADA],
      to: unitOfAccount,
    });
    expect(result.data).to.have.property(tickerADA);
    const currentAda = result.data[tickerADA];
    expect(currentAda).to.have.property("price");
    expect(currentAda).to.have.property("lastUpdate");
    expect(currentAda).to.have.property("changePercent24h");
    expect(Number.parseFloat(currentAda.price)).to.be.greaterThan(0);
    expect(currentAda.lastUpdate).to.be.greaterThan(0);
    expect(Number.parseFloat(currentAda.changePercent24h)).not.to.be.eq(0);
  });

  it("should get ADA history", async () => {
    const result = await axios.post(testableUri, {
      from: [tickerADA],
      to: unitOfAccount,
    });
    expect(result.data).to.have.property(tickerADA);
    expect(result.data[tickerADA]).to.have.property("historyHourly");
    const hourlyAda = result.data[tickerADA].historyHourly;
    expect(hourlyAda).to.have.length.greaterThan(hourlySample);
    expect(hourlyAda[hourlySample]).to.have.property("time");
    const dateHour = new Date();
    dateHour.setUTCMinutes(0, 0, 0);
    const timestampHour =
      dateHour.getTime() / 1000 -
      (hourlyAda.length - 1 - hourlySample) * 60 * 60;
    expect(hourlyAda[hourlySample].time).to.be.eq(timestampHour);
    expect(hourlyAda[hourlySample]).to.have.property("price");
    expect(Number.parseFloat(hourlyAda[hourlySample].price)).to.be.greaterThan(0);

    expect(result.data[tickerADA]).to.have.property("historyDaily");
    const dailyAda = result.data[tickerADA].historyDaily;
    expect(dailyAda).to.have.length.greaterThan(dailySample);
    expect(dailyAda[dailySample]).to.have.property("time");
    const dateDay = new Date();
    dateDay.setUTCHours(0, 0, 0, 0);
    const timestampDay =
      dateDay.getTime() / 1000 -
      (dailyAda.length - 1 - dailySample) * 24 * 60 * 60;
    expect(dailyAda[dailySample].time).to.be.eq(timestampDay);
    expect(dailyAda[dailySample]).to.have.property("price");
    expect(Number.parseFloat(dailyAda[dailySample].price)).to.be.greaterThan(0);
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
