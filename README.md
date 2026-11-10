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

## How it works

Circuit JSON is quoted the way JLCPCB quotes an order: from fabrication files.

1. `convertCircuitJsonToFabricationFiles` generates Gerbers, drill files,
   `bom.csv` and `pick_and_place.csv` with the same converters and options as
   the tscircuit.com fabrication export and `tsci export -f gerbers`.
2. `getQuoteInputsFromFabricationFiles` reads size, layers, vias, holes,
   trace widths, paste openings and the BOM back out of those files.
3. `lookupJlcParts` prices each BOM line from JLCPCB's parts library
   (quantity price breaks, billed spares, preferred flag, stock), using
   [jlcsearch](https://jlcsearch.tscircuit.com) to find parts that have no
   part number and as a fallback.
4. `estimateJlcpcbQuote` prices everything from `lib/jlcpcb-price-table.ts`.

Board thickness and material are order-form choices the files do not carry;
they are read from the `pcb_board` element.

An existing fabrication export can be quoted directly:

```sh
bun scripts/quote-fabrication-files.ts unzipped-export/ --qty 5 --assembled 5
```

Each line item carries a confidence:

- `published`: taken from JLCPCB's help pages.
- `quoted`: read off a live JLCPCB quote page.
- `calibrated`: fitted to tscircuit's own shipped orders.
- `heuristic`: an approximation with a wide low/high range. Bare-PCB prices
  for boards over 100x100mm, more than 5 pieces, or 6+ layers are all
  heuristic today.

`tests/real-orders-replay.test.ts` replays two real orders and one live quote.
It rebuilds their BOM from the invoices, so it checks the fee rules, not part
matching.

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
