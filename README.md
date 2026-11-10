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

1. `extractBoardFeatures` reads size, layers, the smallest via, holes and
   trace widths from the Circuit JSON.
2. `getBomLines` groups placed components and counts their solder joints.
3. `lookupJlcParts` resolves each line on
   [jlcsearch](https://jlcsearch.tscircuit.com): by JLC part number, then
   manufacturer part number, then value and package (basic parts first).
4. `estimateJlcpcbQuote` prices everything from `lib/jlcpcb-price-table.ts`.

Each line item carries a confidence:

- `published`: taken from JLCPCB's help pages.
- `calibrated`: fitted to tscircuit's own shipped orders.
- `heuristic`: an approximation with a wide low/high range. Bare-PCB prices
  for boards over 100x100mm, more than 5 pieces, or 6+ layers are all
  heuristic today.

`tests/real-orders-replay.test.ts` replays two real orders. It rebuilds their
BOM from the invoices, so it checks the fee rules, not part matching.

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
