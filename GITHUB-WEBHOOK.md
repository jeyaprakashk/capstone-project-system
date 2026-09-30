# Organization commit webhook

This integration adds a stateless Cloudflare Worker in front of the existing Apps
Script project. Both webhook ingestion and hourly `fetchAllCommits()` use the
unchanged `appendCollectedCommits_()` writer and its script lock. No additional
sheet, delivery ledger, queue, or database is used.

## Commit fields and API hydration

| Commits field | Authoritative input |
| --- | --- |
| Date | REST `commit.committer.date`, as used by the existing writer |
| Team ID | Unique TeamStatus registration |
| Commit Message | Push contains `message`; the hydrated REST message passes through existing first-line normalization |
| GitHub Username | REST `author.login`, or the writer's existing unknown-author handling |
| Repository URL | Recorded TeamStatus URL, not a URL supplied by the sender |
| Commit SHA | Push `commits[].id`, verified against the REST response |
| GitHub Author ID | REST `author.id`; blank only when REST explicitly returns `author: null` |

Push commit authors expose name/email and an optional username, but no numeric
GitHub account ID. Sender and pusher identify different actors and must never
stand in for the author. The push timestamp is described generically; the current
writer specifically uses the REST committer date. Consequently each **unseen**
SHA needs one commit API request to preserve current attribution. No user lookup,
email matching, new cache, or alternate normalization is introduced. Existing
SHAs skip API hydration; the writer still rechecks SHAs under its lock to cover
concurrent collection. All API work finishes before entering that lock.

Sources checked for this implementation:
- [GitHub push events](https://docs.github.com/en/webhooks/webhook-events-and-payloads#push)
- [GitHub Octokit commit schema](https://github.com/octokit/webhooks/blob/main/payload-schemas/api.github.com/common/commit.schema.json)
- [GitHub Octokit author/committer schema](https://github.com/octokit/webhooks/blob/main/payload-schemas/api.github.com/common/committer.schema.json)
- [REST Get a commit](https://docs.github.com/en/rest/commits/commits#get-a-commit)

## Authentication and routing

GitHub sends JSON to `POST /github/push` on the Worker. It verifies
`X-Hub-Signature-256` over the original bytes with `GITHUB_WEBHOOK_SECRET` using
Web Crypto. Authenticated ping receives 200; other non-push events receive 204
without forwarding. Invalid signatures receive 401. Malformed JSON receives 400.

For pushes, the Worker returns 202 immediately and forwards once using
`ctx.waitUntil()`. It sends `{message, signature}` as JSON to Apps Script:

- `message` is a JSON string containing `version: 1`, `event: "push"`,
  `deliveryId`, `sentAt` (Unix milliseconds), and `payload` (original JSON text).
- `signature` is lowercase hex HMAC-SHA256 over the exact UTF-8 message string,
  signed with the separate `APPS_SCRIPT_RELAY_SECRET`.
- Apps Script accepts only `/exec/github-push`, verifies the signature, and rejects
  envelopes older than five minutes or more than one minute in the future.

The body signature is necessary because the supported Apps Script web-app event
object does not expose arbitrary request headers. Neither secret is placed in a
URL. See [Apps Script request parameters](https://developers.google.com/apps-script/guides/web#request_parameters).

Only complete owner/repository identities belonging to `ece-kalasalingam` and
matching exactly one valid TeamStatus registration are eligible. Comparisons
follow GitHub's case-insensitive repository identity. Unregistered repositories
are silently ignored. Duplicate repository or team registrations fail closed and
are logged; naming patterns never establish team membership. Deletions and empty
pushes are no-ops. The receiver does not update full-collection status.

Apps Script returns JSON with `ok`, `status`, and counts or a safe `code`.
The Worker follows Content Service redirects and checks the JSON result, not just
HTTP status, because an application rejection can still be HTTP 200.

## Configuration

Use two independently generated high-entropy secrets (for example, 32 random
bytes each). Do not commit secret values.

| Location | Name | Value |
| --- | --- | --- |
| Worker secret | `GITHUB_WEBHOOK_SECRET` | Secret later entered in GitHub's webhook settings |
| Worker secret | `APPS_SCRIPT_RELAY_SECRET` | Separate secret shared only with Apps Script |
| Worker variable | `APPS_SCRIPT_WEBHOOK_URL` | Full Apps Script URL ending `/exec/github-push` |
| Apps Script Script Property | `APPS_SCRIPT_RELAY_SECRET` | Exact matching relay secret |
| Existing Apps Script Script Property | `GITHUB_ADMIN_TOKEN` | Keep current token with read access to registered repositories |

The Worker needs no GitHub API token. Its directory is excluded from clasp.
Local `.dev.vars*` and `.wrangler/` artifacts are ignored by Git.

## Later deployment: Apps Script

These are manual rollout instructions, not actions performed by implementation.

1. Upload the reviewed Apps Script source using the project's normal clasp flow.
2. In the existing script project's Settings, add `APPS_SCRIPT_RELAY_SECRET`.
3. Create a **separate web-app deployment in the same script project**:
   execute as the deploying user; access **Anyone**, including anonymous callers.
   Keep the existing domain-only dashboard deployment and its URL unchanged.
   The checked-in manifest retains its DOMAIN default; explicitly select Anyone
   for this deployment rather than changing that default for all future releases.
4. If Workspace policy prevents anonymous web apps, stop rollout: a domain-only
   deployment cannot receive the Worker request. Do not bypass policy or create
   another script project (its lock would not coordinate with daily collection).
5. Copy the deployed `/exec` URL and append `/github-push`:
   `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec/github-push`.
   Do not use `/dev`, a script ID in place of a deployment ID, or a temporary
   `script.googleusercontent.com` response URL.
6. For updates, use Deploy > Manage deployments > select the webhook deployment >
   Edit > New version > Deploy. Keep its deployment ID. Leave the dashboard's
   deployment settings unchanged.
7. Verify anonymous requests without valid relay authentication fail without
   writes, and an anonymous GET does not reveal dashboard data. Then verify a
   correctly signed request through the Worker.

Leave the existing `fetchAllCommits()` hourly reconciliation in place. This change
does not create or modify triggers.

## Later deployment: Cloudflare Worker

From the repository root:

```powershell
Set-Location workers/github-webhook
npx wrangler login
```

Replace the deployment-ID placeholder in `wrangler.jsonc` with the actual Apps
Script deployment ID. The configured name is `capstone-github-webhook`. Then:

```powershell
npx wrangler deploy
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put APPS_SCRIPT_RELAY_SECRET
```

Enter each secret interactively. Secret-put commands also deploy updated Worker
versions. The initial Worker fails closed until secrets are configured. Do not
create the GitHub webhook until both secrets are present. No storage bindings or
runtime npm dependencies are required.

Copy the actual workers.dev hostname reported by Wrangler. The GitHub payload
URL is:

`https://capstone-github-webhook.<ACCOUNT_SUBDOMAIN>.workers.dev/github/push`

See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
and [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Later GitHub organization setup

An organization owner opens **ece-kalasalingam > Settings > Webhooks > Add webhook**:

| Setting | Value |
| --- | --- |
| Payload URL | Actual Worker URL above, including `/github/push` |
| Content type | `application/json` |
| Secret | Exact `GITHUB_WEBHOOK_SECRET` value stored in the Worker |
| Events | Just the push event |
| SSL verification | Enabled |
| Active | Enabled |

The initial ping should succeed without sheet activity. Verify a registered
repository push, an unrelated repository push, and redelivery. Confirm one row
per SHA, correct author ID, and no unrelated-repository rows. Running the normal
hourly reconciliation afterward must not add duplicates.

## Failures and recovery

- A 202 delivery means the Worker accepted it, not that Apps Script finished.
- Worker forwarding has a 25-second timeout and no retry. `ctx.waitUntil()` has
  a 30-second post-response limit. Timeouts do not prove Apps Script failed to
  write; redelivery remains safe. See [Cloudflare context limits](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil).
- Worker observability is enabled. Inspect `github_relay_failure` records for a
  delivery ID and sanitized reason; Apps Script logs `github_webhook_failure`
  and a safe code for receiver errors. No webhook payloads or secrets are added
  to these logs. Existing API-helper logging is unchanged.
- Hourly `fetchAllCommits()` is the recovery path. It uses a rolling two-hour
  default-branch window; it cannot guarantee recovery of missed
  feature-branch-only commits. The receiver ingests only SHAs supplied in the
  push array, which GitHub caps at 2,048. No history backfill is added.
- No deployment, trigger, Script Property, or GitHub webhook is created by the
  tests. Run `npm test` and `git diff --check` for local verification; deployment
  reachability and live delivery still require the manual checks above.
