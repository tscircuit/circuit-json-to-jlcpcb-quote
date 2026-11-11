import type { FabricationFileName, FabricationFiles } from "../types"

export const fabricationFilePatterns = {
  boardOutline: /edge[_.]?cuts|\.gko$|\.gm1$|outline/i,
  copper: /_Cu\.gbr$|\.gtl$|\.gbl$|\.g\d+$/i,
  topCopper: /^F_Cu|\.gtl$/i,
  topPaste: /^F_Paste|\.gtp$/i,
  bottomPaste: /^B_Paste|\.gbp$/i,
  stiffener: /stiffener/i,
  drill: /\.(drl|xln)$/i,
  nonPlatedDrillName: /npth|nonplated/i,
  nonPlatedDrillContent: /NonPlated|NPTH/,
  bom: /bom.*\.csv$/i,
  pickAndPlace: /(pick.?and.?place|cpl|pos).*\.csv$/i,
}

export interface FabricationFile {
  fileName: FabricationFileName
  content: string
}

/** Every file whose name matches the pattern. */
export const findFabricationFiles = (
  files: FabricationFiles,
  pattern: RegExp,
): FabricationFile[] =>
  Object.entries(files)
    .filter(([fileName]) => pattern.test(fileName))
    .map(([fileName, content]) => ({ fileName, content }))

/** Content of the first file whose name matches, or undefined. */
export const findFabricationFile = (
  files: FabricationFiles,
  pattern: RegExp,
): string | undefined => findFabricationFiles(files, pattern)[0]?.content
