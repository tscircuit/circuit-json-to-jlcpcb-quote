import { estimateJlcpcbQuote } from "./estimate-jlcpcb-quote"
import { getQuoteInputsFromFabricationFiles } from "./get-quote-inputs-from-fabrication-files"
import { fabricationPrices, orderDefaults } from "./jlcpcb-price-table"
import { lookupJlcParts } from "./lookup-jlc-parts"
import type {
  BoardFeatures,
  BoardMaterial,
  FabricationFiles,
  FetchLike,
  JlcpcbQuote,
  JlcpcbQuoteOptions,
} from "./types"

/** What the order form says about the board that the files do not */
export interface BoardOrderForm {
  material?: BoardMaterial
  thicknessMm?: number
}

const globalFetch: FetchLike = (url, init) => fetch(url, init)

const applyBoardOrderForm = (
  features: BoardFeatures,
  board: BoardOrderForm,
): { features: BoardFeatures; warnings: string[] } => {
  const material = board.material ?? features.material
  const isMaterialChanged = material !== features.material
  const defaultThicknessMm =
    material === "flex"
      ? fabricationPrices.flex.defaultThicknessMm
      : fabricationPrices.pricedRigidThicknessMm
  return {
    features: {
      ...features,
      material,
      stiffenerCount: material === "flex" ? features.stiffenerCount : 0,
      thicknessMm:
        board.thicknessMm ??
        (isMaterialChanged ? defaultThicknessMm : features.thicknessMm),
    },
    warnings:
      material !== "flex" && features.stiffenerCount > 0
        ? [
            `Quoted as ${material}, but the files contain a stiffener layer, which only flex boards use`,
          ]
        : [],
  }
}

/**
 * Quote a fabrication bundle (Gerbers, drills, bom.csv, pick_and_place.csv),
 * the way JLCPCB quotes an upload.
 */
export const quoteFabricationFiles = async (order: {
  files: FabricationFiles
  options?: JlcpcbQuoteOptions
  board?: BoardOrderForm
}): Promise<JlcpcbQuote> => {
  const options = order.options ?? {}
  const inputs = getQuoteInputsFromFabricationFiles(order.files)
  const board = applyBoardOrderForm(inputs.features, order.board ?? {})
  const warnings = [...inputs.warnings, ...board.warnings]
  if (options.assembly === "none" || inputs.bom.length === 0) {
    return estimateJlcpcbQuote({
      features: board.features,
      bom: [],
      options,
      warnings,
    })
  }

  const lookup = await lookupJlcParts(inputs.bom, {
    fetch: options.fetch ?? globalFetch,
    jlcsearchBaseUrl:
      options.jlcsearchBaseUrl ?? orderDefaults.jlcsearchBaseUrl,
    onProgress: options.onProgress,
  })
  if (
    lookup.unresolvedBomLines.length > 0 &&
    options.unresolvedParts !== "exclude"
  ) {
    const unresolved = lookup.unresolvedBomLines
      .map(({ line, reason }) => `${line.designators.join(",")} (${reason})`)
      .join("; ")
    throw new Error(
      `Cannot price ${lookup.unresolvedBomLines.length} BOM lines: ${unresolved}. Pass unresolvedParts: "exclude" to quote without them.`,
    )
  }
  return estimateJlcpcbQuote({
    features: board.features,
    bom: lookup.pricedBom,
    options,
    excludedBomLines: lookup.unresolvedBomLines,
    warnings: [
      ...warnings,
      ...lookup.warnings,
      ...lookup.unresolvedBomLines.map(
        ({ line, reason }) =>
          `${line.designators.join(",")}: ${reason}; left out of assembly and parts cost`,
      ),
    ],
  })
}
