import { z } from "zod"
import type { JlcPart, LcscPartNumber } from "../types"
import { fetchJsonWithRetry } from "./fetch-json-with-retry"
import type { LookupContext } from "./lookup-context"
import { parseApiResponse } from "./parse-api-response"

const JLCPCB_PARTS_URL =
  "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2"

const jlcpcbComponent = z.object({
  componentCode: z.string(),
  componentModelEn: z.string(),
  componentSpecificationEn: z.string(),
  componentLibraryType: z.string(),
  preferredComponentFlag: z.boolean().nullish(),
  stockCount: z.number(),
  lossNumber: z.number(),
  leastPatchNumber: z.number(),
  componentPrices: z
    .array(z.object({ startNumber: z.number(), productPrice: z.number() }))
    .min(1),
})

const jlcpcbPartsResponse = z.object({
  code: z.literal(200),
  data: z.object({
    componentPageInfo: z.object({
      // Other parts on the page are not validated, only the one asked for.
      list: z
        .array(z.object({ componentCode: z.string() }).passthrough())
        .nullable(),
    }),
  }),
})

/**
 * Read one part from JLCPCB's assembly parts library: the endpoint behind
 * their parts search page, which jlcsearch also uses to verify stock. It is
 * not a documented API and browsers will be blocked by CORS; run it
 * server-side, or use `partSource: "jlcsearch"`.
 *
 * Unlike jlcsearch it returns quantity price breaks and the spare and minimum
 * quantities JLCPCB bills. Returns null when the library has no such part;
 * throws when the answer cannot be read.
 */
export const fetchJlcpcbPart = async (
  lcsc: LcscPartNumber,
  ctx: LookupContext,
): Promise<JlcPart | null> => {
  const { json } = await fetchJsonWithRetry(
    {
      url: JLCPCB_PARTS_URL,
      method: "POST",
      jsonBody: {
        currentPage: 1,
        pageSize: 25,
        keyword: lcsc,
        searchSource: "search",
        searchType: 2,
        componentBrandList: [],
        componentSpecificationList: [],
        componentAttributeList: [],
        paramList: [],
      },
    },
    ctx,
  )
  const { componentPageInfo } = parseApiResponse({
    schema: jlcpcbPartsResponse,
    json,
    source: `JLCPCB's parts library for ${lcsc}`,
  }).data
  const listedComponent = componentPageInfo.list?.find(
    (candidate) => candidate.componentCode === lcsc,
  )
  if (!listedComponent) return null
  const component = parseApiResponse({
    schema: jlcpcbComponent,
    json: listedComponent,
    source: `JLCPCB's record for ${lcsc}`,
  })
  const priceTiers = component.componentPrices
    .map((tier) => ({
      fromQuantity: tier.startNumber,
      unitPrice: tier.productPrice,
    }))
    .sort((a, b) => a.fromQuantity - b.fromQuantity)
  const firstTier = priceTiers[0]
  if (!firstTier) throw new Error(`JLCPCB lists no price for ${lcsc}`)
  return {
    lcsc,
    mfr: component.componentModelEn,
    package: component.componentSpecificationEn,
    isBasic: component.componentLibraryType === "base",
    isPreferred: component.preferredComponentFlag === true,
    unitPrice: firstTier.unitPrice,
    stock: component.stockCount,
    priceTiers,
    billing: {
      spareQuantity: component.lossNumber,
      minimumQuantity: component.leastPatchNumber,
    },
    source: "jlcpcb",
  }
}
