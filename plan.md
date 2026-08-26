# Orgs implementation plan

Design: see `design.md`. Rollout is 5 independently deployable phases: expand (1), switch readers (2), account migration (3), org UI (4), contract (5). Prod never breaks: old `user_id` columns keep working until phase 5, writers set both old and new columns during the transition.

## Phase 1: Directus supports orgs

All org operations become possible on the Directus side. No UI yet.

Both shapes have to work at the same time and in both directions: a caller still using `userId` / `user_id` / `user` must end up
with `account_id` filled, and a caller already using `account_id` must not be rejected and must leave the legacy column filled for
the old readers. Code is written account-first; everything that only serves the old shape is marked `// PHASE5: remove` so that
phase 5 deletes marked code instead of rewriting it. See `phase1.md` for the contract.

- Schema (snapshot): `gp_orgs` (+ `extra_adoption_tokens` json, written only by the account migration one phase later, but shipped here because gp-api reads it in phase 2), `gp_org_members` (role: viewer | member | admin, `notification_preferences`), `gp_accounts`, `account_id` in gp_probes / gp_tokens / gp_apps_approvals / gp_credits / gp_credits_deductions, reverse o2m aliases `directus_users.account` and `gp_orgs.account`. `gp_apps_approvals`: add `user_created` alongside `user` (gp-auth still writes `user`).
- Knex migration: backfill `gp_accounts` for every user, backfill `account_id` from `userId` / `user_id`, insert-triggers on `directus_users` / `gp_orgs`, XOR check, uniques (`accounts.user`, `accounts.org`, `members(org, user)`, `credits.account_id`), FK actions (accounts cascade, `gp_tokens.user_created` cascade).
- Knex migration: replace `gp_apps_approvals` `UNIQUE(user, app)` with `UNIQUE(user_created, app, account_id)`. Ships here, not in phase 2: Directus is not deployed again in that phase, so the old key would still be in place when gp-auth starts creating per-account approvals.
- Permissions migration: the per-table rules from `design.md`.
- GitHub sync: fetch org memberships + roles with the user's token only, new sync lib (upsert gp_orgs + gp_accounts + gp_org_members, promote to admin but never demote, on leave: delete membership + that member's org tokens and approvals), wire into sign-in hook, sign-up hook, sync-github-data endpoint.
- Hooks: gp-tokens create (payload `account_id` = own account or org where role is admin/member), adopted-probe (tag prefix from account owner: org name or github_username; reset fields on `account_id` -> null), gp_org_members update (per-field: `role` by org admin, `notification_preferences` on own row), notifications (org events fan out to members per their prefs, most org notifications off by default).
- Endpoints: adoption-code + local-adoption resolve the owner (org adoption token; `activeOrg` param accepted only from an admin of that org), applications endpoint gains `accountId` scoping (approvals are bound to a specific account). Every endpoint taking `userId` (adoption-code, applications, credits-timeline) accepts `accountId` as the primary parameter, with `userId` kept as a `// PHASE5: remove` shim.
- gp-orgs read hook: strip `adoption_token` for non-admin roles.
- Credits: probe credits cron resolves `github_id` from the probe's account owner, org balance initialized from unconsumed additions when an org is first created, low-credits notifies org admins. `SOURCE_ID_TO_TARGET_ID` redirect stays.
- Dual-write: every writer that sets `userId` / `user_id` also sets `account_id` (adoption, signup credits, deductions writer stays API-side until phase 2).
- Seeds + unit tests + e2e for permissions and sync.

## Phase 2: gp-api, gp-auth, gp-dash switch to account_id

Readers move to the new columns. No new UI. Directus is not deployed again here, so everything it needs for the new shape - schema,
keys, permissions, endpoint parameters - has to be in phase 1. Accepted: until this phase ships, an org token created via raw API bills its creator personally.

- gp-api: `auth.ts` selects `account_id`, billing target = token's `account_id`; `credits-master` consumes by `account_id`; deductions written with `account_id`; `adopted-probes` joins accounts -> users / orgs (prefix, adoption token, public probe tag via COALESCE); `adoption-token` includes org adoption tokens in the token map. Notifications are posted with `account` instead of `recipient`, and the API-side notification dedup (currently by `recipient` + `message`) switches to an account-aware check - for an org probe the stored recipients are the org admins.
- gp-auth: consent flow gets the account context (cookie or param), validates membership + role (viewer can't approve for org), writes `account_id` + `user_created`; the "already approved" check and issued tokens are per account. It may stop writing `user` - the phase 1 trigger fills it - but it must keep sending the approving user in `user_created`: an approval with no user at all is rejected.
- gp-dash: `getUserFilter` and probes / credits / tokens queries read `account_id` instead of `userId` / `user_id`. Deploy together with or after the phase 1 permissions migration (filters return empty otherwise).

## Phase 3: account migration

The back end of the "migrate to organization" button, in its own Directus deploy. It has to come after phase 2: until the readers
use `account_id`, moving credits takes the balance out of where `credits-master` looks for it, and moving probes or tokens does
nothing at all. Full design in `account-migration.md`.

- Migration endpoint - who may migrate, probes, adoption token, tokens with approvals, credits, in one transaction.
- `gp_credits_redirects` table + read permission, `redirectGithubId` reads it instead of `SOURCE_ID_TO_TARGET_ID`. Seeded with the
  current six, so nothing changes for prod on deploy.
- `gp_orgs` update hook validating `extra_adoption_tokens`: entry shape, and the new array being a subset of the old one.
- One-off conversion of the six sponsor accounts, reusing the endpoint's code rather than repeating it: create the org if the
  sync has not, re-point vidalytics' additions from the deleted target (`219827779` -> `21207279`) first, then run the transfer
  and disable the old redirect. Whatever the owners do themselves through the UI later needs no conversion at all - decide how
  much of this to automate once the button exists.
- Unit tests + e2e over REST.

## Phase 4: gp-dash org UI

User-visible org support, including the UI for the migration back end from phase 3. Directus is deployed here too, for the
permissions migration below.

- "Migrate to organization" UI over the phase 3 endpoint: pick the org, tick what moves (probes, tokens, credits), confirm - the
  operation is irreversible, so the screen has to list exactly what will happen. Shown only to users the endpoint would accept
  (`account-migration.md`), and the credits section names the redirect it is about to disable.
- Redirects page: the redirects where the user is the source, or where an org they administer is the target.
- Org settings list the org's extra adoption tokens with the username each came from, and let any admin remove one (`account-migration.md`).
- Org store: memberships + roles loaded on login, own account id resolved via `readMe` expansion, `activeOrg` in store + cookie.
- Header: "Act as organization" button + select modal, active org shown instead of the username.
- Probes list + detail: org view, edit controls and adopt only for admin (role-gated). In org mode a non-admin is not offered adoption at all - neither the adoption code flow nor the local network adoption (the endpoints reject it, the UI must not show it).
- Every adoption call passes `accountId` explicitly (the active account, personal or org): adoption-code `send-code`/`verify-code` and local-adoption `/adopt`. The legacy `userId` form and the implicit personal-account default stay only for the old dashboard and are dropped in phase 5.
- Credits page: org stats and history in org view.
- Tokens page: own tokens and approvals inside the org, generate token creates an org item, disabled for viewers.
- Settings: "Organization" section (only admin sees, copies, and regenerates the org adoption token).
- Admin-only "Organization" page: org info, members list, role management.
- Permissions migration - `directus_users` read for co-members. Today the only read rule is `id _eq $CURRENT_USER`
  (`20230425GP-create-user-role.js`), so the members list and the extra adoption tokens would render bare uuids. Add a second read
  rule, `{ "memberships": { "org": { "members": { "user": { "_eq": "$CURRENT_USER" } } } } }`, exposing `id` and `github_username`
  only - the `memberships` alias already exists on `directus_users` (`one_field` of the `gp_org_members.user` relation).
- Hint on the org page when the org has no admins: it hasn't approved the `globalping` OAuth app in its GitHub settings, so roles are invisible to us.
- e2e.

## Phase 5: cleanup

Remove the transition scaffolding. Only after phases 1-4 have soaked in prod.

- Drop the `*_fulfill_account` triggers FIRST, with `migrate:one`, and only then let `schema:apply` drop the columns. Dropping a column a trigger reads does not disable the trigger - every write to the table fails with `Unknown column ... in 'NEW'` until it is gone, and `schema:apply` runs before `migrate`.
- Drop old columns: `gp_probes.userId`, `gp_credits.user_id`, `gp_credits_deductions.user_id`, `gp_apps_approvals.user`.
- Remove dual-write / dual-read support from extensions and gp-api.
- Drop `default_prefix`, `deprecated_prefix`, `github_organizations` from `directus_users`; remove the tag-prefix-selector interface, simplify gp-tags. Tag prefixes stop being stored/validated: the prefix is generated from the probe's account owner (org name or github_username) when the tag is built.

Added while implementing phase 1 (remove or update in phase 5):

- Triggers `gp_tokens_fulfill_account`, `gp_apps_approvals_fulfill_account` (`20260731GP`) - fulfill `account_id` for the rows gp-auth writes. Drop once it sets the account itself, in phase 2.
- `gp_apps_approvals_fulfill_account` also copies `user` -> `user_created`; drop together with the `user` column.
- Credits triggers (`20260731GP`) write both `user_id` and `account_id`; drop `user_id` from the inserts.
- `after_gp_credits_update` writes deductions with both; `gp_credits_deductions` keeps both `unique_user_id_date` and `gp_credits_deductions_account_id_date_unique` - drop the legacy one.
- `gp_credits`, `gp_credits_deductions`, `gp_probes`, `gp_tokens`, `gp_apps_approvals` keep legacy indexes on the old user columns - drop with the columns. `gp_apps_approvals_user_index` was added in `20260731GP` only to free the `user` foreign key from the unique key being replaced.
- `gp_probes` update permission validation keeps the `userId _null` clause next to `account_id _null`; `userId` stays in the allowed update fields (dash sends it until phase 2).
- `getRequestAccountId` loses its legacy `userId` branch: with `accountId` the only input it stops resolving anything, so it becomes `validateAccountId(accountId, accountability, context, roles)` returning nothing, and the callers read `accountId` straight from the request.
- The phase 1 org e2e drives Directus over REST because there is no org UI yet - move whatever the phase 4 dashboard covers to UI
  tests, and keep REST only for what the UI can't reach.
- Optional: a middleware that resolves the requester's accounts once per request (personal account id + org account ids with roles) and puts them on the request, so the endpoint checks become synchronous instead of each doing its own lookup. Must be a middleware, not JWT claims: static API tokens never go through `auth.jwt`, so claims would only cover the dashboard.
