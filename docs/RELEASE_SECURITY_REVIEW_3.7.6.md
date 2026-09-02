# DigiWP Ai Bridge 3.7.6 — release security review

Date: 2026-08-31

## Conclusion

The blocked 3.7.4 archive contained repository development playbooks under the
WordPress plugin directory. Security-review documents included literal examples
of direct request-data execution and unrestricted upload handling. Those files
were documentation, not PHP loaded by WordPress, but an archive scanner sees the
same byte sequences as a web shell or upload backdoor.

The 3.7.6 WordPress archive contains only the runtime PHP file and readme. The 18
engineering playbooks remain available through the same MCP tools, resources,
prompts, and cookbook recipes, but requested text is now loaded from the
configured DigiWP server and cached in the WordPress database. It is never
written into the site's webroot.

This evidence supports an archive-scanner false positive as the cause of the
reported upload block. It does not identify the hosting provider's exact rule:
the notice did not include the scanner product, signature ID, or matched inner
file.

## Artifact comparison

| | Blocked archive | Release 3.7.6 |
|---|---:|---:|
| SHA-256 | `A88B3FFCCFB4189D7BF454F97741E30B2491DE0BF9B01683EF98A5287A831399` | `9B5E815A9B4B617AFF8272DDDFDFECF7FB2DE3D482A4BA979FF2B9957AD06C11` |
| ZIP entries | 118 | 2 |
| Files | 80 | 2 |
| Development playbook entries | 78 | 0 |
| Direct request-to-execution example matches | 1 | 0 |
| Raw `move_uploaded_file($_FILES...)` example matches | 5 | 0 |
| Literal registered tool names | 59 | 59 |
| Registered tool names removed | — | 0 |

The two new archive entries are:

- `digiwp-ai-bridge/digiwp-ai-bridge.php`
- `digiwp-ai-bridge/readme.txt`

## Independent and local checks

- PHP 8.1 syntax validation passed for the canonical plugin and both generated
  release variants.
- PHP token inspection found zero real calls to `eval`, `assert`, `system`,
  `exec`, `shell_exec`, `passthru`, `proc_open`, `popen`, `base64_decode`,
  `unserialize`, or `move_uploaded_file` in the shipped runtime. Words used in
  scanner signatures and explanations are strings/comments, not executable
  calls.
- Kaspersky Internet Security 21.3, with antivirus bases dated
  `2026-08-31 08:25`, scanned all 80 extracted old files and both extracted new
  files with iChecker/iSwift disabled: 82 processed, 82 OK, 0 detected,
  0 suspicious, 0 skipped, 0 errors.
- The official portable ClamAV 1.5.4 download was verified against its published
  SHA-256 (`0d9e0228b2674137ea1a2853566c98a0278ad52ab2582c3d6dbd75373848c395`).
  Its signature CDN returned HTTP 403 for this network/region, so no ClamAV
  verdict is claimed.
- No plugin source or archive was uploaded to a public malware-analysis service.
  Public upload services can retain or redistribute proprietary source. Only
  exact-hash lookups were attempted, and neither release hash had a public search
  result at review time.

## Regression verification

- Server suite: 281 tests, 270 passed, 0 failed, 11 skipped because
  `CB_TEST_DATABASE_URL` was not configured.
- New playbook endpoint and release tests: catalog count, individual file load,
  path traversal rejection, unknown-file rejection, two-file archive boundary,
  version consistency, and bounded remote retrieval all passed.
- Hub production build passed.
- Hub lint currently has unrelated pre-existing errors in account/site UI files;
  no hub application code was changed for this remediation.

## Deployment order

1. Deploy the updated DigiWP server first so `/v1/skills` and
   `/v1/skills/:name` are available.
2. Publish the 3.7.6 ZIP and matching plugin manifest.
3. Ask the hosting provider to scan the new SHA-256 and provide the scanner name,
   signature ID, and matched inner path if it is still blocked.
4. Upload only the 3.7.6 artifact. Do not retry the blocked 3.7.4 ZIP.

The normal WordPress upload handler may stage a plugin ZIP under
`wp-content/uploads` while processing `wp-admin/update.php`; those paths alone do
not prove a site compromise. A separate site-compromise investigation is needed
only if the host reports another unexpected upload, an unknown uploader IP, or a
match in a file outside this known release archive.
