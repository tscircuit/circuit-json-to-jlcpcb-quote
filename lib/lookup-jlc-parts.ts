import type { BomLine } from "./types"

interface SearchResult {
  lcsc: number
  mfr: string
  package: string
  description: string
  is_basic: boolean
  is_preferred: boolean
  stock: number | null
  price: number
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * Resolve each BOM line to a JLCPCB part through jlcsearch, in order of
 * trust: explicit JLC part number, manufacturer part number, then
 * value + package for passives (preferring basic, in-stock, cheapest).
 * Requests run one at a time; jlcsearch rejects bursts.
 */
export const lookupJlcParts = async (params: {
  bom: BomLine[]
  baseUrl?: string
  fetch?: typeof fetch
}): Promise<string[]> => {
  const baseUrl = params.baseUrl ?? "https://jlcsearch.tscircuit.com"
  const fetchFn = params.fetch ?? fetch
  const warnings: string[] = []

  const search = (query: string) =>
    get(`/api/search?q=${encodeURIComponent(query)}&limit=20`, "components")

  const get = async (path: string, key: string): Promise<SearchResult[]> => {
    const url = `${baseUrl}${path}`
    let lastError = ""
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt))
      try {
        const response = await fetchFn(url)
        const body: any = await response.json().catch(() => null)
        if (response.ok && Array.isArray(body?.[key])) {
          return body[key].map((c: any) => ({
            ...c,
            price: c.price ?? c.price1,
          }))
        }
        lastError = body?.message ?? body?.error ?? `HTTP ${response.status}`
      } catch (error) {
        lastError = String(error)
      }
    }
    throw new Error(`jlcsearch ${path} failed: ${lastError}`)
  }

  for (const line of params.bom) {
    const name = line.designators.join(",")
    try {
      let match: SearchResult | undefined
      if (line.requestedJlcPartNumber) {
        const wanted = Number(line.requestedJlcPartNumber.replace(/^C/i, ""))
        match = (await search(`C${wanted}`)).find((c) => c.lcsc === wanted)
        if (match) line.matchMethod = "jlc_part_number"
      }
      if (!match && line.manufacturerPartNumber) {
        const wanted = normalize(line.manufacturerPartNumber)
        match = pickBest(
          (await search(line.manufacturerPartNumber)).filter(
            (c) => normalize(c.mfr) === wanted,
          ),
        )
        if (match) line.matchMethod = "manufacturer_part_number"
      }
      if (!match && line.valueLookup) {
        const { category, params: query } = line.valueLookup
        const queryString = new URLSearchParams(query).toString()
        // Basic parts carry no loading fee, so look for one first.
        for (const filter of ["&is_basic=true", ""]) {
          const candidates = await get(
            `/${category}/list.json?${queryString}${filter}`,
            category,
          ).catch(() => [])
          match = pickBest(candidates)
          if (match) break
        }
        if (match) {
          line.matchMethod = "value"
          warnings.push(
            `${name}: no part number given, matched ${line.value} to C${match.lcsc} (${match.mfr}) by value`,
          )
        }
      }
      if (!match) {
        warnings.push(
          `${name}: no JLCPCB part found${line.requestedJlcPartNumber ? ` for ${line.requestedJlcPartNumber}` : ""}; left out of assembly and parts cost`,
        )
        continue
      }
      line.part = {
        lcsc: `C${match.lcsc}`,
        mfr: match.mfr,
        package: match.package,
        description: match.description,
        isBasic: Boolean(match.is_basic),
        isPreferred: Boolean(match.is_preferred),
        unitPrice: Number(match.price) || 0,
        stock: match.stock,
      }
      if (match.stock === 0) {
        warnings.push(`${name}: C${match.lcsc} is out of stock at JLCPCB`)
      }
    } catch (error) {
      warnings.push(
        `${name}: part lookup failed (${error instanceof Error ? error.message : error}); left out of assembly and parts cost`,
      )
    }
  }
  return warnings
}

const pickBest = (candidates: SearchResult[]): SearchResult | undefined =>
  [...candidates].sort(
    (a, b) =>
      Number(b.is_basic) - Number(a.is_basic) ||
      Number(b.is_preferred) - Number(a.is_preferred) ||
      Number((b.stock ?? 1) > 0) - Number((a.stock ?? 1) > 0) ||
      a.price - b.price,
  )[0]
