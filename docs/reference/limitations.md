# Known Limitations

- Single-owner only: one passphrase, one TOTP secret, one user.
- No multi-tenant isolation: all data is in one D1 database.
- Tag pagination is approximate: with tag-only filtering at very low selectivity, pagination can skip some matches. For exhaustive export, use `knowledge://entries` and filter client-side.
- Vectorize requires separate setup: semantic search works only when AI + Vectorize bindings are configured in `wrangler.jsonc`.
- D1 row size limit: async ingestion caps content at about 900KB per task; larger input should be pre-chunked and stored entry-by-entry.
