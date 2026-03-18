# Project Structure

```text
src/
|-- index.orch.0.js       # Worker entry orchestration and dependency wiring
|-- auth.efct.js          # Auth route effects
|-- totp.pure.js          # TOTP/HOTP pure helpers
|-- webauthn.pure.js      # WebAuthn pure helpers
|-- webauthn.efct.js      # WebAuthn KV/JSON effects
|-- db/                   # Persistence modules split by .pure/.efct/.ops.efct
|-- domain/               # Domain logic split by .pure/.efct/.ops.efct
|-- mcp/                  # MCP tool/resource/prompt wiring
|-- lib/                  # Shared pure/effect helpers and *.type.js contracts
|-- wiring/               # Runtime/default handler orchestration
|-- templates/            # HTML renderers and template tests
`-- types/                # Shared type declarations and ambient module defs

evals/
|-- baselines/            # Placeholder in current snapshot
`-- datasets/             # Placeholder in current snapshot
```
