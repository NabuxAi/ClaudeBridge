# ClaudeBridge MCP authentication hardening — migration and rollout

**Status:** Security changes proposed on a separate branch; **not deployed to production**.

## Behavior changes

- The bridge no longer accepts credentials in query strings or POST parameters. `?token=...` will fail even when the token is correct.
- Static tokens are generated with `random_bytes(32)` (256 bits) and stored only as a SHA-256 digest. Existing plaintext tokens are migrated on first use/admin visit without changing the token value.
- New or rotated tokens are shown **once**, in WordPress **Tools → Claude Bridge**. Save the token in a password manager. Rotating revokes the previous static token immediately.
- The default permission for static and hub credentials is **Audit-only**, an explicit allowlist of diagnostic tools. Generic REST, arbitrary file reads, private orders, secrets, user data and writes are not included.
- An administrator may explicitly select **Full administrator (high risk)** for a trusted credential in the same WordPress settings page. This is a highly privileged automation token: treat it as a root-equivalent secret.
- OAuth access tokens must belong to a WordPress user who currently has the `edit_themes` capability. Revoking the user's capability invalidates their bridge access.
- Twelve failed MCP authentications from a server-observed source address within 15 minutes produce a 429 response, a minimal pseudonymous audit alert and a `cb_mcp_auth_rate_limited` hook. Do not trust X-Forwarded-For unless the network edge explicitly validates it. Behind a shared proxy, add edge rate limiting to avoid accidental blocking of unrelated visitors.
- Responses on the bridge REST routes use `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`.
- Hub HMAC signatures changed from **v1** `timestamp\nbody` to **v2** `timestamp\nnonce\nbody`, with a fresh 16-byte random nonce on each request. WordPress accepts a nonce only once using the atomic options unique key and deletes expired records hourly. The Node Hub rejects duplicate nonces within one process for its inbound routes.

## Required rollout precautions

1. Make a backup and complete the PHP lint and Node unit tests in the pull request. Review any deployment scripts and confirm a rollback artifact exists.
2. **Do not roll out only one side of HMAC v2.** The old Hub and upgraded plugin cannot authenticate each other. Coordinate deployment on a staging site, then deploy the Hub and WordPress plugin together in a scheduled maintenance window. Keep the last known-good versions ready for rollback.
3. Update all clients using `?token=` to `Authorization: Bearer <token>` **before** rollout. Clients that cannot set headers should use the built-in OAuth authorization flow instead.
4. Check Tools → Claude Bridge. For read-only monitoring retain Audit-only. If a site explicitly requires modification tools, grant Full administrator **only to the necessary trusted connection** and recognize the broader risk.
5. After migrating clients, rotate exposed or URL-logged tokens and update the client secret store. Rotate any leaked pairing HMAC secret on **both** sides.
6. Verify authenticated tool discovery, one legitimate tool call, a denied unauthorized call, a blocked replay, and that URLs/logs/caches contain no tokens.
7. The Hub's inbound nonce cache is **process-local**. Before multi-instance deployments, replace it with an atomic shared store (e.g. Redis SET NX EX or a database unique key), otherwise replay rejection across replicas is incomplete.

## Tests

```bash
php -l wp-claude-bridge.php
cd server
npm ci
node --test test/connector.test.js test/site-address.test.js
```

## Rollback

Rolling back the WordPress plugin while keeping the new Hub, or vice versa, will break HMAC pairing. Roll both together. Static bearer tokens rotated after this change are stored as hashes and cannot be recovered in plaintext; generate a fresh token in the admin interface if restoring an old version or connection configuration. Avoid sending secrets through URLs, pull requests, logs, support tickets or issue comments.

## Known follow-up

For high-traffic multi-replica Hubs, implement shared atomic replay storage. Consider site-specific service accounts and finer per-tool scopes if full administrator operations must be exposed outside an intentionally trusted environment.
