import { z } from "zod"
import type { JlcPart, LcscPartNumber } from "../types"
import { fetchJsonWithRetry } from "./fetch-json-with-retry"
import {
  convertJlcsearchComponentToJlcPart,
  jlcsearchComponent,
} from "./jlcsearch-component"
import type { LookupContext } from "./lookup-context"
import { parseApiResponse } from "./parse-api-response"

const searchResponse = z.object({ components: z.array(jlcsearchComponent) })

/**
 * Read one part from jlcsearch by part number. It carries a single-piece
 * price only, with no price breaks or billed spares. Returns null when
 * jlcsearch has no such part.
 */
export const fetchJlcsearchPart = async (
  lcsc: LcscPartNumber,
  ctx: LookupContext,
): Promise<JlcPart | null> => {
  const url = `${ctx.jlcsearchBaseUrl}/api/search?q=${lcsc}&limit=20`
  const { json } = await fetchJsonWithRetry({ url }, ctx)
  const { components } = parseApiResponse({
    schema: searchResponse,
    json,
    source: `jlcsearch for ${lcsc}`,
  })
  const component = components.find(
    (candidate) => `C${candidate.lcsc}` === lcsc,
  )
  return component ? convertJlcsearchComponentToJlcPart(component) : null
}
