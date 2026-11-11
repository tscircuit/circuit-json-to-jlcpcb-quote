import type {
  AssemblyType,
  BoardMaterial,
  JlcpcbQuoteOptions,
  ShippingCarrier,
  SurfaceFinish,
} from "../lib/index"

const ASSEMBLY_CHOICES: (AssemblyType | "auto")[] = [
  "auto",
  "economic",
  "standard",
  "none",
]
const FINISH_CHOICES: SurfaceFinish[] = [
  "hasl_leaded",
  "hasl_lead_free",
  "enig",
]
const MATERIAL_CHOICES: BoardMaterial[] = ["fr4", "flex"]
const CARRIER_CHOICES: ShippingCarrier[] = ["dhl", "ups"]

/** Text after `--name`, or undefined when the flag is absent. */
export const readFlag = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}

const readChoice = <Choice extends string>(
  flag: { args: string[]; name: string },
  choices: Choice[],
): Choice | undefined => {
  const text = readFlag(flag.args, flag.name)
  if (text === undefined) return undefined
  const choice = choices.find((candidate) => candidate === text)
  if (!choice) {
    throw new Error(`--${flag.name} must be one of ${choices.join(", ")}`)
  }
  return choice
}

const readNumber = (args: string[], name: string): number | undefined => {
  const text = readFlag(args, name)
  if (text === undefined) return undefined
  const amount = Number(text)
  if (!Number.isFinite(amount)) throw new Error(`--${name} must be a number`)
  return amount
}

export const readQuoteOptions = (args: string[]): JlcpcbQuoteOptions => ({
  quantity: readNumber(args, "qty"),
  assembledQuantity: readNumber(args, "assembled"),
  assembly: readChoice({ args, name: "assembly" }, ASSEMBLY_CHOICES),
  surfaceFinish: readChoice({ args, name: "finish" }, FINISH_CHOICES),
  unresolvedParts: args.includes("--exclude-unresolved") ? "exclude" : "error",
  carrier: readChoice({ args, name: "carrier" }, CARRIER_CHOICES),
  shippingCost: readNumber(args, "shipping-cost"),
  shippingWeightKg: readNumber(args, "weight"),
  salesTaxRate: readNumber(args, "sales-tax-rate"),
})

export const readBoardOrderForm = (args: string[]) => ({
  material: readChoice({ args, name: "material" }, MATERIAL_CHOICES),
  thicknessMm: readNumber(args, "thickness"),
})
