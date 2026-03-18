# Deploy LORE

## One-Click Install on Cloudflare

1. Use the deploy button in the repository README.
2. When prompted for `ACCESS_PASSPHRASE`, create a long, unique passphrase.
3. Finish deploy, then open `https://<your-worker>.workers.dev/authorize`.
4. Sign in and enroll either:
   - Passkey (recommended), or
   - TOTP via authenticator app.
5. Use your MCP endpoint in your AI client(s):

```text
https://<your-worker>.<subdomain>.workers.dev/mcp
```

## First Run Checklist

- Confirm you can open `/authorize`.
- Confirm 2FA enrollment completes.
- Confirm at least one client can connect to `/mcp`.
