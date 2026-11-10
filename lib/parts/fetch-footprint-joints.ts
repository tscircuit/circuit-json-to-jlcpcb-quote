import { z } from "zod"
import type { LcscPartNumber, PricedBomLine } from "../types"
import { fetchJsonWithRetry } from "./fetch-json-with-retry"
import type { LookupContext } from "./lookup-context"
import { parseApiResponse } from "./parse-api-response"

const easyedaShapes = z.object({ shape: z.array(z.string()) })

const easyedaComponentResponse = z.object({
  easyeda_component_details: z.object({
    easyeda_json: z.object({
      packageDetail: z.object({
        // EasyEDA stores the footprint either inline or as a JSON string.
        dataStr: z.union([
          easyedaShapes,
          z
            .string()
            .transform((footprintJson) => JSON.parse(footprintJson))
            .pipe(easyedaShapes),
        ]),
      }),
    }),
  }),
})

/** In an EasyEDA "PAD~..." shape, field 6 is the layer; 11 is multi-layer. */
const EASYEDA_PAD_LAYER_FIELD = 6
const EASYEDA_MULTI_LAYER = "11"

/**
 * Count the SMT and through-hole pads of a part's JLCPCB (EasyEDA) footprint,
 * through jlcsearch's cached copy. Fabrication files do not say which pads
 * belong to which part, and the split decides whether a part is soldered by
 * hand. Returns null when no footprint exists for the part.
 */
export const fetchFootprintJoints = async (
  lcsc: LcscPartNumber,
  ctx: LookupContext,
): Promise<PricedBomLine["footprintJoints"] | null> => {
  const url = `${ctx.jlcsearchBaseUrl}/api/easyeda_components/${lcsc}`
  const { status, json } = await fetchJsonWithRetry({ url }, ctx)
  if (status === 404) return null
  const { shape } = parseApiResponse({
    schema: easyedaComponentResponse,
    json,
    source: `jlcsearch's footprint for ${lcsc}`,
  }).easyeda_component_details.easyeda_json.packageDetail.dataStr
  let smt = 0
  let throughHole = 0
  for (const shapeText of shape) {
    if (!shapeText.startsWith("PAD~")) continue
    const layer = shapeText.split("~")[EASYEDA_PAD_LAYER_FIELD]
    if (layer === EASYEDA_MULTI_LAYER) throughHole++
    else smt++
  }
  return { smt, throughHole }
}
