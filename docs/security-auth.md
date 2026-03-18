# Security and Auth

Single-owner, two-factor authentication:

- Passphrase via `ACCESS_PASSPHRASE`
- Passkey (WebAuthn), preferred 2FA
- TOTP as fallback 2FA

## Security Controls

- CSRF tokens on auth forms
- One-time OAuth/enrollment nonces in KV with TTL
- Timing-safe passphrase and TOTP comparison
- IP lockout after 5 failed attempts in a 15-minute window
- Security headers: CSP (nonce for passkey JS), HSTS, X-Frame-Options, no-store

## Reset Credentials

```bash
npx wrangler kv key delete --binding OAUTH_KV "ks:passkey:cred"   # reset passkey
npx wrangler kv key delete --binding OAUTH_KV "ks:totp:secret"    # reset TOTP
```
