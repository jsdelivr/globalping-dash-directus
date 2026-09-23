# Orgs implementation plan

Design: see `design.md`. Rollout is 5 independently deployable phases: expand (1), switch readers (2), account migration (3), org UI (4), contract (5). Prod never breaks: old `user_id` columns keep working until phase 5, writers set both old and new columns during the transition.

## Phase 1: Directus supports orgs

All org operations become possible on the Directus side. No UI yet.

Both shapes have to work at the same time and in both directions: a caller still using `userId` / `user_id` / `user` must end up
with `account_id` filled, and a caller already using `account_id` must not be rejected and must leave the legacy column filled for
the old readers. Code is written account-first; everything that only serves the old shape is marked `// PHASE5: remove` so that
phase 5 deletes marked code instead of rewriting it. See `phase1.md` for the contract.

- Schema (snapshot): `gp_orgs` (+ `extra_adoption_tokens` json, written only by the account migration one phase later, but shipped here because gp-api reads it in phase 2; + `public_probes` boolean, the org's own switch for the global `u-<org name>` tag, shipped here for the same reason - gp-api reads it in phase 2, the UI comes in phase 4), `gp_org_members` (role: viewer | member | admin, `notification_preferences`), `gp_accounts`, `account_id` in gp_probes / gp_tokens / gp_apps_approvals / gp_credits / gp_credits_deductions, reverse o2m aliases `directus_users.account` and `gp_orgs.account`. `gp_apps_approvals`: add `user_created` alongside `user` (gp-auth still writes `user`).
- Knex migration: backfill `gp_accounts` for every user, backfill `account_id` from `userId` / `user_id`, insert-triggers on `directus_users` / `gp_orgs`, XOR check, uniques (`accounts.user`, `accounts.org`, `members(org, user)`, `credits.account_id`), FK actions (accounts cascade, `gp_tokens.user_created` cascade).
- Knex migration: replace `gp_apps_approvals` `UNIQUE(user, app)` with `UNIQUE(user_created, app, account_id)`. Ships here, not in phase 2: Directus is not deployed again in that phase, so the old key would still be in place when gp-auth starts creating per-account approvals.
- Permissions migration: the per-table rules from `design.md`, plus `gp_orgs.public_probes` (readable by members, writable by admins).
- GitHub sync: fetch org memberships + roles with the user's token only, new sync lib (upsert gp_orgs + gp_accounts + gp_org_members, promote to admin but never demote, on leave: delete membership + that member's org tokens and approvals), wire into sign-in hook, sign-up hook, sync-github-data endpoint.
- Hooks: gp-tokens create (payload `account_id` = own account or org where role is admin/member), adopted-probe (tag validation unchanged - prefixes still come from `github_username` + `github_organizations`, narrowed only in phase 5; reset fields on `account_id` -> null), gp_org_members update (per-field: `role` by org admin, `notification_preferences` on own row), notifications (org events fan out to members per their prefs, most org notifications off by default).
- Endpoints: adoption-code + local-adoption resolve the owner (org adoption token; `activeOrg` param accepted only from an admin of that org), applications endpoint gains `accountId` scoping (approvals are bound to a specific account). Every endpoint taking `userId` (adoption-code, applications, credits-timeline) accepts `accountId` as the primary parameter, with `userId` kept as a `// PHASE5: remove` shim.
- gp-orgs read hook: strip `adoption_token` for non-admin roles.
- Credits: probe credits cron resolves `github_id` from the probe's account owner, org balance initialized from unconsumed additions when an org is first created, low-credits notifies org admins. `SOURCE_ID_TO_TARGET_ID` redirect stays.
- Dual-write: every writer that sets `userId` / `user_id` also sets `account_id` (adoption, signup credits, deductions writer stays API-side until phase 2).
- Seeds + unit tests + e2e for permissions and sync.

## Phase 2: gp-api, gp-auth, gp-dash switch to account_id

Readers move to the new columns. No new UI. Directus is not deployed again here, so everything it needs for the new shape - schema,
keys, permissions, endpoint parameters - has to be in phase 1. Accepted: until this phase ships, an org token created via raw API bills its creator personally.

- gp-api: `auth.ts` selects `account_id`, billing target = token's `account_id` - a token with no creator keeps a null account and has to stay "no owner" rather than an error (client-credentials tokens have `user_created IS NULL`, and there are plenty of them in prod); `credits-master` consumes by `account_id`; deductions need no work here - gp-api only decrements `gp_credits` (`credits-master.ts:65,98,117`) and the `after_gp_credits_update` trigger writes the row with both columns; `adopted-probes` joins accounts -> users / orgs for the adoption token and the global tag - `COALESCE(org.name, user.default_prefix)`, gated by `COALESCE(org.public_probes, user.public_probes)`, plus `deprecated_prefix` for personal accounts (drop it and everyone in a grace period loses their old `u-<name>` silently), and the current `status = 'active'` condition on the user join (`adopted-probes.ts:376`) has to move onto the account's user - without it probes of banned users get their tags and location overrides back. `default_prefix` stays the source for personal accounts: deriving the tag from the owner's name here would take `u-<org>` away from the probes whose owner picked an org name, three phases before anything offers them a way back. Per-probe tag prefixes keep being read from the row, unchanged; `adoption-token` includes org adoption tokens in the token map. Notifications are posted with `account` instead of `recipient`, and the API-side notification dedup (currently by `recipient` + `message`) switches to an account-aware check - for an org probe the stored recipients are the org admins.
- gp-auth: consent flow gets the account context (cookie or param), validates membership + role (viewer can't approve for org), writes `account_id` + `user_created`; the "already approved" check and issued tokens are per account. It may stop writing `user` - the phase 1 trigger fills it - but it must keep sending the approving user in `user_created`: an approval with no user at all is rejected.
- gp-dash: `getUserFilter` and probes / credits / tokens queries read `account_id` instead of `userId` / `user_id`. Deploy together with or after the phase 1 permissions migration (filters return empty otherwise).

## Phase 3: account migration

The back end of the "migrate to organization" button, in its own Directus deploy. It has to come after phase 2: until the readers
use `account_id`, moving credits takes the balance out of where `credits-master` looks for it, and moving probes or tokens does
nothing at all. Full design in `account-migration.md`.

- Migration endpoint - who may migrate, probes, adoption token, tokens with approvals, credits, in one transaction.
- `gp_credits_redirects` table, `redirectGithubId` reads it instead of `SOURCE_ID_TO_TARGET_ID`. Seeded with the
  current ones, so nothing changes for prod on deploy.
- `gp_orgs` update hook validating `extra_adoption_tokens`: entry shape, and the new array being a subset of the old one.
- No one-off conversion. The redirects we have are seeded into the table and keep working exactly as they do now; unwinding one is
  the owner's choice through the phase 4 buttons, or the org's by clearing its own redirect.
- `gp_orgs.user_type` (member | sponsor | special) and the tier moving to the account. Today the tier comes from the requesting
  person: `auth.ts` joins it off `directus_users`, gp-api encodes it into the measurement id (`USER_TIER`) and the offloader
  stores the result in `measurement_<tier>`. It grants nothing - no limits, no credits - it only picks the table. That is
  harmless until this phase, because an org can not own a sponsorship yet; once the credits and the redirect move here, the org
  is the sponsor while `user_type` stays on its members. Then a member who is not a sponsor writes org measurements into
  `measurement_member`, and a sponsor who left the org keeps writing them into `measurement_sponsor`. Fix: take the tier from
  the account owner - `COALESCE(org.user_type, user.user_type)`, the same shape already used for `default_prefix` and
  `adoption_token` - and teach the sponsors cron to set it on the org: it matches sponsors by `external_identifier` today, and
  an org has `github_id`.
- Permissions migration - `directus_users` read for org admins. Today the only read rule is `id _eq $CURRENT_USER`
  (`20230425GP-create-user-role.js`), so the members list of phase 4 would render bare uuids. Add a second read rule,
  `{ "memberships": { "org": { "members": { "user": { "_eq": "$CURRENT_USER" }, "role": { "_eq": "admin" } } } } }`, exposing
  `id` and `github_username` only - the `memberships` alias already exists on `directus_users` (`one_field` of the
  `gp_org_members.user` relation). Shipped here so that phase 4 is a dash deploy only.
- Unit tests + e2e over REST.

## Phase 4: gp-dash org UI

User-visible org support, including the UI for the migration back end from phase 3. A dash deploy only: everything it relies on
in Directus shipped in phase 3.

- "Migrate to organization", a section of the user settings: four rows - transfer probes, transfer tokens, transfer credits,
  redirect sponsorship credits - each a button opening its own modal that does only that one thing: pick an org, read what will
  happen, confirm, with an irreversibility warning on the three transfers. Offers the `selected_orgs` where the user is an admin
  or a member, and is hidden when there is none. The redirect row shows the current state, `john => acme-org`, with a cross to
  clear it; the credits modal names the redirect the transfer is about to delete.
- Org store: memberships + roles loaded on login, own account id resolved via `readMe` expansion, `activeOrg` in store + cookie.
- "Act as organization" in the user menu, between Settings and Sign out: a submenu with the personal account and the
  `selected_orgs` where the user is an admin or a member, plus "+ Add organization" - a modal with a table of the orgs that could
  be added, each with an "Add" button writing `selected_orgs`. Picking an org sets `activeOrg` and the cookie, and the header shows
  the org's name instead of the GitHub username.
- The CLI, the chat bots and the MCP server read `organization` from `/oauth/token/introspect` (it ships in phase 2) and say which account a token acts for, so "Logged in as john" stops hiding that the credits come from an org.
- Probes list + detail: org view, edit controls and adopt only for admin (role-gated). In org mode a non-admin is not offered adoption at all - neither the adoption code flow nor the local network adoption (the endpoints reject it, the UI must not show it).
- Every adoption call passes `accountId` explicitly (the active account, personal or org): adoption-code `send-code`/`verify-code` and local-adoption `/adopt`. The legacy `userId` form and the implicit personal-account default stay only for the old dashboard and are dropped in phase 5.
- The OAuth approval screen gains the account picker and posts `accountId` on every approval, the personal account included. Until then the field stays optional in gp-auth: the deployed screen posts only `approved`, and a missing `accountId` has to keep meaning the personal account.
- Credits page: org stats and history in org view.
- Tokens page: own tokens and approvals inside the org, generate token creates an org item, disabled for viewers.
- "Organization" screen, admins only, a navigation entry under Tokens. Settings first: the org adoption token (copy, regenerate),
  the public-probes switch (`gp_orgs.public_probes`, which makes the org's probes globally targetable as `u-<org name>` - what
  replaces "point my personal `default_prefix` at an org name" from phase 5 on), the extra adoption tokens with the username each
  came from and a way to remove one, and the org's own inherited credits redirect with a cross to clear it. Members second: the
  list and role management, where demoting someone to viewer warns before saving - the database trigger deletes their org tokens
  and app approvals, irreversibly.
- e2e.

## Phase 5: cleanup

Remove the transition scaffolding. Only after phases 1-4 have soaked in prod.

- Drop the `*_fulfill_account` triggers FIRST, with `migrate:one`, and only then let `schema:apply` drop the columns. Dropping a column a trigger reads does not disable the trigger - every write to the table fails with `Unknown column ... in 'NEW'` until it is gone, and `schema:apply` runs before `migrate`.
- Drop old columns: `gp_probes.userId`, `gp_credits.user_id`, `gp_credits_deductions.user_id`, `gp_apps_approvals.user`.
- `gp_apps_approvals.user` is the one case where no order avoids a gap: dropping its trigger first leaves the NOT NULL column with nothing to fill it (`1364 Field 'user' doesn't have a default value`, gp-auth stopped writing it in phase 2), and dropping the column first breaks the trigger that reads `NEW.user`. Do both in the same deploy and accept the seconds in between - the table is small, so at worst someone's consent screen has to be repeated. The strict trigger-first order still matters for the probe and credit tables, where the same gap would land on constant writes.
- Make `account_id` NOT NULL in `gp_apps_approvals`, `gp_credits`, `gp_credits_deductions`. Every row has been filled since phase 1 by the backfill and the triggers, and once the legacy columns are gone an ownerless row should stop being representable at all. `gp_probes.account_id` and `gp_tokens.account_id` are the exceptions and stay nullable: a probe that nobody has adopted has no owner to point at, and client-credentials tokens are issued for `{ id: null }`, so they have neither a user nor an account by design. `gp_apps_approvals.user_created` goes NOT NULL with them: it shares the unique key with `account_id`, and a unique index does not deduplicate NULLs, so either column left nullable lets duplicate approvals through. Make sure to do the same NOT NULL updates in api and auth dev db schemas.
- `POST /oauth/approve` makes `accountId` required: by then every approval comes from the phase 4 screen, which always names the account, so the implicit personal-account fallback can go.
- Remove dual-write / dual-read support from extensions and gp-api.
- Tags: phases 1-4 change nothing about them - the prefix select, the validation and both prefix fields work exactly as today, and
  the restrictions land only here. Nothing is renamed, ever. The prefix stored in `gp_probes.tags` stays the source of truth, so every existing tag keeps
  working - including those whose prefix is an org name or a username the owner no longer has. What goes away is the choice: the
  prefix select disappears, a new or edited tag always gets the owner's name (org name or `github_username`), and old tags can only
  be deleted. `validateTags` shrinks to a comparison against that one name, which is what lets `github_organizations` go.
- Personal probes lose the org names as prefixes here, ending up under the rule org probes follow from phase 2 on: a new or edited
  tag may only carry the owner's own name. Existing tags are untouched - `validateTags` only looks at tags that are not already on
  the probe - so tags whose prefix is an org name or a former username keep resolving.
- Editing an old tag renames its prefix, so the dialog has to say so before saving - the same trap `format: 'v1'` already has today.
- `default_prefix` stays editable, but the choice shrinks to two values: the one the user has now and their `github_username`.
  `validateDefaultPrefix` becomes `Joi.string().valid(user.github_username, user.default_prefix)` - the stored value, which it
  already reads from the database - and the settings selector lists the username plus the current value when the two differ. That
  keeps the users whose prefix is an org name on the tag their probes already emit - some of them have `public_probes`, so that
  tag is publicly targetable today, and it makes the switch one-way in practice without ever coercing anybody: the moment someone
  picks their username the org value leaves the allowed set. The field therefore stays in the `directus_users.update` fields of the
  User policy - the hook is what narrows it, not the permission - and the selector must render the current value explicitly, or a
  plain two-option select silently rewrites them on the next save. The automatic rename when the prefix goes stale
  (`checkDefaultPrefix`) keeps running - it writes through a service with no accountability, so nothing here applies to it -
  otherwise a renamed user squats their old name forever and a user who left an org keeps its name. Its validity check moves from
  `github_organizations` to the org names in `gp_org_members`, which the sync maintains anyway; note that it stays a wider set than
  the one the user may write, because the two answer different questions - "do you still have a claim to this name" and "what may
  you set". `deprecated_prefix` stays as a column. `tags` stays writable: the restriction there is `validateTags`, not the
  permission.
- Accepted: a prefix outlives its owner's claim to it - if someone else takes the freed username, both accounts emit
  tags with that prefix. Already true today; generating the prefix from the owner would have been the only thing that ever healed it.
- `format: 'v1'` is untouched - some probes keep the `u-prefix-value` separator until their owner saves the tags. Optional cleanup: the
  `searchIndex` trigger (`20260815GP:29`) indexes them as `u-prefix:value`, so dashboard search and the API disagree on those.

Added while implementing phase 1 (remove or update in phase 5):

- Triggers `gp_tokens_fulfill_account`, `gp_apps_approvals_fulfill_account` (`20260814GP`) - fulfill `account_id` for the rows gp-auth writes. Dead once phase 2 ships: gp-auth sets the account itself.
- `gp_apps_approvals_fulfill_account` also fills the NOT NULL `user` column that gp-auth stopped writing in phase 2, so it goes together with that column - see phase 5.
- Credits triggers (`20260814GP`) write both `user_id` and `account_id`; drop `user_id` from the inserts.
- `after_gp_credits_update` writes deductions with both; `gp_credits_deductions` keeps both `unique_user_id_date` and `gp_credits_deductions_account_id_date_unique` - drop the legacy one.
- `gp_credits`, `gp_credits_deductions`, `gp_probes`, `gp_tokens`, `gp_apps_approvals` keep legacy indexes on the old user columns - drop with the columns. `gp_apps_approvals_user_index` was added in `20260814GP` only to free the `user` foreign key from the unique key being replaced.
- `gp_probes` update permission validation keeps the `userId _null` clause next to `account_id _null`; `userId` stays in the allowed update fields (dash sends it until phase 2).
- `getRequestAccountId` loses its legacy `userId` branch: with `accountId` the only input it stops resolving anything, so it becomes `validateAccountId(accountId, accountability, context, roles)` returning nothing, and the callers read `accountId` straight from the request.
- The phase 1 org e2e drives Directus over REST because there is no org UI yet - move whatever the phase 4 dashboard covers to UI
  tests, and keep REST only for what the UI can't reach.
- Optional: a middleware that resolves the requester's accounts once per request (personal account id + org account ids with roles) and puts them on the request, so the endpoint checks become synchronous instead of each doing its own lookup. Must be a middleware, not JWT claims: static API tokens never go through `auth.jwt`, so claims would only cover the dashboard.
