# circuit-json-to-jlcpcb-quote

Convert [Circuit JSON](https://github.com/tscircuit/circuit-json) into a JLCPCB
manufacturing quote.

The estimate covers bare PCBs, the charges JLCPCB engineers add after review
(such as the 4-wire Kelvin test for small vias), assembly fees and parts.
Shipping, duties and taxes are not included.

## Installation

Releases are published to GitHub Packages and served from jscdn, so no registry
configuration or token is needed:

```sh
bun add https://jscdn.tscircuit.com/@tscircuit/circuit-json-to-jlcpcb-quote/0.0.2.tgz
```

## Usage

```ts
import {
  convertCircuitJsonToJlcpcbQuote,
  formatJlcpcbQuote,
} from "@tscircuit/circuit-json-to-jlcpcb-quote"

const quote = await convertCircuitJsonToJlcpcbQuote({
  circuitJson,
  quantity: 5,
  assembledQuantity: 2,
  assembly: "auto", // "economic" | "standard" | "none"
  surfaceFinish: "hasl_leaded", // "hasl_lead_free" | "enig"
})

console.log(quote.total, quote.lowTotal, quote.highTotal)
console.log(formatJlcpcbQuote(quote))
```

From the command line:

```sh
bun scripts/quote.ts board.circuit.json --qty 5 --assembled 2 --assembly economic
```

An existing fabrication export can be quoted directly with
`quoteFabricationFiles`, or:

```sh
bun scripts/quote-fabrication-files.ts unzipped-export/ --qty 5 --assembled 5
```

## How it works

Circuit JSON is quoted the way JLCPCB quotes an order: from fabrication files.

1. `convertCircuitJsonToFabricationFiles` generates Gerbers, drill files,
   `bom.csv` and `pick_and_place.csv` with the same converters and options as
   the tscircuit.com fabrication export and `tsci export -f gerbers`.
2. `getQuoteInputsFromFabricationFiles` reads size, layers, vias, holes,
   trace widths, paste openings and the BOM back out of those files.
3. `lookupJlcParts` prices each BOM line from JLCPCB's parts library
   (quantity price breaks, billed spares, preferred flag, stock) and reads
   each part's footprint from [jlcsearch](https://jlcsearch.tscircuit.com).
   Resistors and capacitors with no part number are matched on jlcsearch by
   rating and package.
4. `estimateJlcpcbQuote` applies the prices and rules in
   `lib/jlcpcb-price-table.ts`. It is pure, so real orders are replayed
   against it in the tests.

Board thickness and material are order-form choices the files do not carry;
they are read from the `pcb_board` element.

## It refuses instead of guessing

A quote that silently leaves something out comes out low, so these throw:

- a BOM line that cannot be priced (no part number, not in JLCPCB's library,
  no footprint). Pass `unresolvedParts: "exclude"` to quote without those
  lines; they are then listed in `quote.excludedBomLines`.
- a part lookup that fails or answers in an unexpected shape
- a board with no price in the table: a layer count, rigid thickness,
  material or surface finish that has not been priced

## Part prices

`partSource: "jlcpcb"` (the default) calls the endpoint behind JLCPCB's parts
search page, the same one jlcsearch uses to verify stock. It is not a
documented API, and browsers are blocked from it by CORS, so run the quote
server-side. `partSource: "jlcsearch"` works anywhere but only knows
single-piece prices; spares are then estimated and the parts line gets a
range.

## Confidence

Each line item carries a confidence:

- `published`: taken from JLCPCB's help pages.
- `quoted`: read off a live JLCPCB quote page.
- `calibrated`: fitted to tscircuit's own shipped orders.
- `heuristic`: an approximation with a wide low/high range. Bare-PCB prices
  for 1-2 layer boards over 100x100mm, more than 5 pieces, 6+ layers, ENIG
  and all flex boards are heuristic today.

## Development

```sh
bun install
bun test
bun run typecheck
bun run format
```

The package ships its TypeScript source from `lib/` and has no build step.
Every push to `main` after the first publishes a new version, so replace
`0.0.2` above with the version in `package.json`.
