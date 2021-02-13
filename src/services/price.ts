import {Request, Response} from "express";
import {assertNever, validateCurrenciesReq} from "../utils";
import {YoroiPriceCache} from "../Transactions/types";
import axios from "axios";

export const currReqLimit: number = 20; // config.get("server.currenciesLimit");
// Note: this could be improved by making the currencies input dynamic
const geckoUrl = "https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd%2Ceur%2Ckrw%2Cjpy%2Crub%2Ccny%2Caed%2Cars%2Caud%2Cbdt%2Cbhd%2Cbmd%2Cbrl%2Ccad%2C%2Cchf%2Cclp%2Cczk%2Cdkk%2Cgbp%2Chkd%2Chuf%2Cils%2Cinr%2Cidr%2Ckwd%2Clkr%2Cmmk%2Cmxn%2Cmyr%2Cngn%2Cnok%2Ctwd%2Cnzd%2Cphp%2Cpkr%2Cpln%2Csar%2Csek%2Csgd%2Cthb%2Ctry%2Cuah%2Cvef%2Cvnd%2Czar%2Cxd&include_last_updated_at=true"

interface PriceCached {
    [currency: string]: {
        price: string,
        lastUpdated: number,
    }
}

export const handlePrice = (yoroiPriceCache: YoroiPriceCache) => async (req: Request, res: Response): Promise<void> => {
    if(!req.body || !req.body.currencies) {
        throw new Error("No currencies");
    }

    const verifiedCurrs = validateCurrenciesReq(currReqLimit, req.body.currencies);
    switch(verifiedCurrs.kind) {
        case "ok": {
            if (yoroiPriceCache.isCurrencyCacheActive) {
                let cachedPrices: PriceCached = {};
                for (const currency of verifiedCurrs.value) {
                    const currencyCachedPrice = await yoroiPriceCache.lruCache.get(currency)
                    if (currencyCachedPrice) {
                        cachedPrices[currency] = { price: currencyCachedPrice.price, lastUpdated: currencyCachedPrice.lastUpdated}
                    }
                }

                if (!Object.values(cachedPrices).some(e => (e == null)) && Object.values(cachedPrices).length == verifiedCurrs.value.length) {
                    console.log("handlePrice:: Using cached prices")
                    console.log(cachedPrices)
                    res.send(cachedPrices);
                    return;
                }
            }

            const result = await axios({method: "get", url: geckoUrl});
            const results = result.data["cardano"]

            console.log("handlePrice:: Coingecko response")
            console.log(result.data)
            if (yoroiPriceCache.isCurrencyCacheActive) {
                console.log("handlePrice:: Updating cached prices")
                for (const currency of verifiedCurrs.value) {
                    const storeObj: PriceCached = { price: results[currency], lastUpdated: results["last_updated_at"]}
                    await yoroiPriceCache.lruCache.set(currency, storeObj);
                }
            }

            const resp = Object.keys(results).reduce((priceResp: PriceCached, currency: string) => {
                if (verifiedCurrs.value.includes(currency)) {
                    priceResp[currency] = { price: results[currency], lastUpdated: results["last_updated_at"]}
                }
                return priceResp;
            }, {})

            res.send(resp);
            return;
        }
        case "error":
            throw new Error(verifiedCurrs.errMsg);

        default:
            return assertNever(verifiedCurrs);
    }
};
