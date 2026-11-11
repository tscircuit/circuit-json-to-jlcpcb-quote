import type {
  AssemblyType,
  BoardMaterial,
  BoardOrderForm,
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

const getField = (form: HTMLFormElement, name: string) => {
  const field = form.elements.namedItem(name)
  if (
    !(field instanceof HTMLInputElement) &&
    !(field instanceof HTMLSelectElement)
  ) {
    throw new Error(`Order form has no "${name}" field`)
  }
  return field
}

const readOptionalNumber = (form: HTMLFormElement, name: string) => {
  const text = getField(form, name).value.trim()
  if (text === "") return undefined
  const amount = Number(text)
  if (!Number.isFinite(amount)) throw new Error(`"${name}" must be a number`)
  return amount
}

const readChoice = <Choice extends string>(
  field: { form: HTMLFormElement; name: string },
  choices: Choice[],
): Choice | undefined =>
  choices.find((choice) => choice === getField(field.form, field.name).value)

/** Read the order options from the page's form. */
export const readOrderForm = (
  form: HTMLFormElement,
): { options: JlcpcbQuoteOptions; board: BoardOrderForm } => {
  const excludeField = getField(form, "excludeUnresolved")
  return {
    options: {
      quantity: readOptionalNumber(form, "quantity"),
      // Without assembly the field is disabled and its count is ignored.
      assembledQuantity:
        getField(form, "assembly").value === "none"
          ? undefined
          : readOptionalNumber(form, "assembledQuantity"),
      assembly: readChoice({ form, name: "assembly" }, ASSEMBLY_CHOICES),
      surfaceFinish: readChoice(
        { form, name: "surfaceFinish" },
        FINISH_CHOICES,
      ),
      carrier: readChoice({ form, name: "carrier" }, CARRIER_CHOICES),
      shippingCost: readOptionalNumber(form, "shippingCost"),
      shippingWeightKg: readOptionalNumber(form, "shippingWeightKg"),
      unresolvedParts:
        excludeField instanceof HTMLInputElement && excludeField.checked
          ? "exclude"
          : "error",
    },
    board: {
      material: readChoice({ form, name: "material" }, MATERIAL_CHOICES),
      thicknessMm: readOptionalNumber(form, "thicknessMm"),
    },
  }
}
