import type { PassiveLookup } from "../types"
import type { CsvRow } from "./parse-csv-rows"

const SI_PREFIX_SCALE = new Map<SiPrefix, number>([
  ["p", 1e-12],
  ["n", 1e-9],
  ["u", 1e-6],
  ["µ", 1e-6],
  ["m", 1e-3],
  ["", 1],
  ["k", 1e3],
  ["K", 1e3],
  ["M", 1e6],
])
type SiPrefix = "p" | "n" | "u" | "µ" | "m" | "" | "k" | "K" | "M"

const PASSIVE_FOOTPRINT = /^(res|cap)(\d{4})/i
const SI_QUANTITY = /^([\d.]+)\s*([pnuµmkKM]?)/

const isSiPrefix = (prefix: string): prefix is SiPrefix =>
  SI_PREFIX_SCALE.has(prefix as SiPrefix)

/**
 * For a BOM row with no part number, describe a jlcsearch query from its
 * rating and footprint ("10k" + "res0402", "100n" + "cap0603"). Undefined
 * when the row is not a recognisable chip resistor or capacitor.
 */
export const getPassiveLookup = (bomRow: CsvRow): PassiveLookup | undefined => {
  const footprint = bomRow.Footprint?.match(PASSIVE_FOOTPRINT)
  const quantity = (bomRow.Value || bomRow.Comment || "").match(SI_QUANTITY)
  if (!footprint?.[1] || !footprint[2] || !quantity) return undefined
  const prefix = quantity[2] ?? ""
  if (!isSiPrefix(prefix)) return undefined
  const scale = SI_PREFIX_SCALE.get(prefix)
  const magnitude = Number(quantity[1])
  if (scale === undefined || !Number.isFinite(magnitude)) return undefined
  const chipSize = footprint[2]
  return footprint[1].toLowerCase() === "res"
    ? {
        category: "resistors",
        query: { resistance: String(magnitude * scale), package: chipSize },
      }
    : {
        category: "capacitors",
        query: {
          capacitance: (magnitude * scale).toExponential(),
          package: chipSize,
        },
      }
}
