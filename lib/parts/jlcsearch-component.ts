import { z } from "zod"
import type { JlcPart } from "../types"

/** A row of jlcsearch's /api/search and /<category>/list.json answers */
export const jlcsearchComponent = z.object({
  lcsc: z.number(),
  mfr: z.string(),
  package: z.string(),
  is_basic: z.boolean().nullish(),
  is_preferred: z.boolean().nullish(),
  stock: z.number().nullish(),
  price: z.number().nullish(),
  price1: z.number().nullish(),
})
export type JlcsearchComponent = z.infer<typeof jlcsearchComponent>

/** A row of jlcsearch's /api/search answer, which also carries the description */
export const jlcsearchSearchComponent = jlcsearchComponent.extend({
  description: z.string(),
})
export type JlcsearchSearchComponent = z.infer<typeof jlcsearchSearchComponent>

export const convertJlcsearchComponentToJlcPart = (
  component: JlcsearchSearchComponent,
): JlcPart => {
  const unitPrice = component.price ?? component.price1
  if (unitPrice === null || unitPrice === undefined) {
    throw new Error(`jlcsearch lists no price for C${component.lcsc}`)
  }
  return {
    lcsc: `C${component.lcsc}`,
    mfr: component.mfr,
    package: component.package,
    description: component.description,
    isBasic: component.is_basic === true,
    isPreferred: component.is_preferred === true,
    unitPrice,
    stock: component.stock ?? null,
    // jlcsearch reports neither quantity price breaks nor billed spares.
    priceTiers: [],
    billing: null,
  }
}
