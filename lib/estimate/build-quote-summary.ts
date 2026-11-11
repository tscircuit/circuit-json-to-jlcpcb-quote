import type {
  AdditionalFee,
  AssemblyOption,
  QuoteLineItem,
  QuoteSummary,
  QuoteSummaryRow,
  ShippingOption,
} from "../types"
import { roundToCents } from "./create-quote-line-item"
import { sumLineItems } from "./estimate-assembly-option"

interface SummaryInput {
  quantity: number
  assembledQuantity: number
  fabricationLineItems: QuoteLineItem[]
  additionalFees: AdditionalFee[]
  /** The PCBA service the totals are for; undefined without assembly */
  selectedAssembly: AssemblyOption | undefined
  /** Why Economic PCBA was not used, when it was not */
  economicUnavailableReasons: string[]
  selectedShipping: ShippingOption
}

const createRow = (row: {
  key: string
  label: string
  lineItems: QuoteLineItem[]
  boards: { count: number; unit: QuoteSummaryRow["perBoardUnit"] }
  note?: string
}): QuoteSummaryRow => {
  const total = sumLineItems(row.lineItems, "cost")
  return {
    key: row.key,
    label: row.label,
    total,
    lowTotal: sumLineItems(row.lineItems, "lowCost"),
    highTotal: sumLineItems(row.lineItems, "highCost"),
    perBoard: roundToCents(total / row.boards.count),
    perBoardUnit: row.boards.unit,
    ...(row.note ? { note: row.note } : {}),
  }
}

const getAssemblyRows = (
  input: SummaryInput,
  boards: { count: number; unit: QuoteSummaryRow["perBoardUnit"] },
): QuoteSummaryRow[] => {
  const option = input.selectedAssembly
  if (!option) return []
  const service = option.assembly === "economic" ? "Economic" : "Standard"
  const partsLineItems = option.lineItems.filter(
    (item) => item.category === "components",
  )
  return [
    createRow({
      key: "assembly",
      label: `Assembly, ${service} PCBA`,
      lineItems: option.lineItems.filter(
        (item) => item.category !== "components",
      ),
      boards,
      note:
        option.assembly === "standard" &&
        input.economicUnavailableReasons.length > 0
          ? `Economic PCBA is not available: ${input.economicUnavailableReasons.join("; ")}`
          : undefined,
    }),
    createRow({
      key: "parts",
      label: "Parts",
      lineItems: partsLineItems,
      boards,
      note: partsLineItems[0]?.label,
    }),
  ]
}

/**
 * One row per kind of expense, each with its total and per-board price, and
 * a grand total that includes shipping and taxes. Fabrication is per PCB.
 * Everything else, and the grand total, is per assembled board when boards
 * are assembled (bare extra PCBs included in the cost), otherwise per PCB.
 */
export const buildQuoteSummary = (input: SummaryInput): QuoteSummary => {
  const perPcb = { count: input.quantity, unit: "pcb" as const }
  const perOrderedBoard =
    input.assembledQuantity > 0
      ? { count: input.assembledQuantity, unit: "assembled_board" as const }
      : perPcb
  const shippingLineItems = input.selectedShipping.lineItems
  const shippingRows = shippingLineItems.map((item) =>
    createRow({
      key: item.key,
      label: item.label,
      lineItems: [item],
      boards: perOrderedBoard,
      note: item.confidence === "heuristic" ? item.note : undefined,
    }),
  )
  const rows = [
    createRow({
      key: "fabrication",
      label: `PCB fabrication, ${input.quantity} boards`,
      lineItems: input.fabricationLineItems,
      boards: perPcb,
    }),
    ...(input.additionalFees.length > 0
      ? [
          createRow({
            key: "additional_fees",
            label: `Additional fees (${input.additionalFees.length})`,
            lineItems: input.additionalFees,
            boards: perOrderedBoard,
            note: input.additionalFees.map((fee) => fee.label).join(", "),
          }),
        ]
      : []),
    ...getAssemblyRows(input, perOrderedBoard),
    ...shippingRows,
  ]
  return {
    rows,
    grandTotal: createRow({
      key: "grand_total",
      label: "Grand total",
      lineItems: [
        ...input.fabricationLineItems,
        ...input.additionalFees,
        ...(input.selectedAssembly?.lineItems ?? []),
        ...shippingLineItems,
      ],
      boards: perOrderedBoard,
    }),
  }
}
