import type { JlcPart } from "./types"

const JLCPCB_PARTS_URL =
  "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2"

/**
 * Read one part from JLCPCB's assembly parts library (the same endpoint
 * jlcsearch uses to verify stock). Unlike jlcsearch it returns the quantity
 * price tiers and the spare/minimum quantities JLCPCB bills, which is what
 * makes the parts cost match their quote. Returns null when the part is not
 * in the library.
 */
export const fetchJlcpcbPart = async (
  lcscNumber: number,
  fetchFn: typeof fetch = fetch,
): Promise<JlcPart | null> => {
  const code = `C${lcscNumber}`
  let lastError = ""
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt))
    try {
      const response = await fetchFn(JLCPCB_PARTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPage: 1,
          pageSize: 25,
          keyword: code,
          searchSource: "search",
          searchType: 2,
          componentBrandList: [],
          componentSpecificationList: [],
          componentAttributeList: [],
          paramList: [],
        }),
      })
      const body: any = await response.json().catch(() => null)
      const list = body?.data?.componentPageInfo?.list
      if (!response.ok || body?.code !== 200) {
        lastError = `HTTP ${response.status}`
        continue
      }
      const row = (Array.isArray(list) ? list : []).find(
        (item: any) => item.componentCode === code,
      )
      if (!row) return null
      const priceTiers = (
        Array.isArray(row.componentPrices) ? row.componentPrices : []
      )
        .map((tier: any) => ({
          fromQuantity: Number(tier.startNumber),
          unitPrice: Number(tier.productPrice),
        }))
        .filter(
          (tier: any) =>
            Number.isFinite(tier.fromQuantity) && tier.unitPrice >= 0,
        )
        .sort((a: any, b: any) => a.fromQuantity - b.fromQuantity)
      return {
        lcsc: code,
        mfr: String(row.componentModelEn ?? ""),
        package: String(row.componentSpecificationEn ?? ""),
        description: String(row.describe ?? ""),
        isBasic: row.componentLibraryType === "base",
        isPreferred: row.preferredComponentFlag === true,
        unitPrice: Number(row.initialPrice ?? priceTiers[0]?.unitPrice) || 0,
        stock: Number.isFinite(row.stockCount) ? row.stockCount : null,
        priceTiers,
        spareQuantity: Number(row.lossNumber) || 0,
        minimumQuantity: Number(row.leastPatchNumber) || 0,
        source: "jlcpcb",
      }
    } catch (error) {
      lastError = String(error)
    }
  }
  throw new Error(`JLCPCB parts lookup for ${code} failed: ${lastError}`)
}
