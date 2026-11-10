import { z } from "zod"
import type { LcscPartNumber, PassiveLookup } from "../types"
import { fetchJsonWithRetry } from "./fetch-json-with-retry"
import {
  type JlcsearchComponent,
  jlcsearchComponent,
} from "./jlcsearch-component"
import type { LookupContext } from "./lookup-context"
import { parseApiResponse } from "./parse-api-response"

const listResponse = z.record(z.array(jlcsearchComponent))

const hasStock = (component: JlcsearchComponent) => (component.stock ?? 1) > 0

/** Preferred, then in stock, then cheapest */
const compareCandidates = (a: JlcsearchComponent, b: JlcsearchComponent) =>
  Number(b.is_preferred === true) - Number(a.is_preferred === true) ||
  Number(hasStock(b)) - Number(hasStock(a)) ||
  (a.price1 ?? a.price ?? Number.POSITIVE_INFINITY) -
    (b.price1 ?? b.price ?? Number.POSITIVE_INFINITY)

/**
 * Pick a JLCPCB part for a resistor or capacitor that has no part number.
 * Basic parts carry no loading fee, so they are searched first. Returns null
 * when jlcsearch lists nothing with that rating and package.
 */
export const findPassiveOnJlcsearch = async (
  passiveLookup: PassiveLookup,
  ctx: LookupContext,
): Promise<LcscPartNumber | null> => {
  const query = new URLSearchParams(passiveLookup.query).toString()
  for (const basicFilter of ["&is_basic=true", ""]) {
    const url = `${ctx.jlcsearchBaseUrl}/${passiveLookup.category}/list.json?${query}${basicFilter}`
    const { json } = await fetchJsonWithRetry({ url }, ctx)
    const candidates = parseApiResponse({
      schema: listResponse,
      json,
      source: `jlcsearch ${passiveLookup.category}`,
    })[passiveLookup.category]
    if (!candidates) {
      throw new Error(
        `jlcsearch answered without a "${passiveLookup.category}" list`,
      )
    }
    const best = [...candidates].sort(compareCandidates)[0]
    if (best) return `C${best.lcsc}`
  }
  return null
}
