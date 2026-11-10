# circuit-json-to-jlcpcb-quote

Convert [Circuit JSON](https://github.com/tscircuit/circuit-json) into a JLCPCB
manufacturing quote.

> [!WARNING]
> This package is a scaffold. `convertCircuitJsonToJlcpcbQuote` is exported but
> not implemented yet and always rejects.

## Installation

Releases are published to GitHub Packages and served from jscdn, so no registry
configuration or token is needed:

```sh
bun add https://jscdn.tscircuit.com/@tscircuit/circuit-json-to-jlcpcb-quote/0.0.2
```

## Usage

```ts
import { convertCircuitJsonToJlcpcbQuote } from "@tscircuit/circuit-json-to-jlcpcb-quote"

const jlcpcbQuote = await convertCircuitJsonToJlcpcbQuote({ circuitJson })
```

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
