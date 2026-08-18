# Orgs implementation plan

Design: see `design.md`. Rollout is 4 independently deployable phases: expand (1), switch readers (2), org UI (3), contract (4). Prod never breaks: old `user_id` columns keep working until phase 4, writers set both old and new columns during the transition.

## Phase 1: Directus supports orgs

All org operations become possible on the Directus side. No UI yet.

Both shapes have to work at the same time and in both directions: a caller still using `userId` / `user_id` / `user` must end up
with `account_id` filled, and a caller already using `account_id` must not be rejected and must leave the legacy column filled for
the old readers. Code is written account-first; everything that only serves the old shape is marked `// PHASE4: remove` so that
phase 4 deletes marked code instead of rewriting it. See `phase1.md` for the contract.

- Schema (snapshot): `gp_orgs`, `gp_org_members` (role: viewer | member | admin, `notification_preferences`), `gp_accounts`, `account_id` in gp_probes / gp_tokens / gp_apps_approvals / gp_credits / gp_credits_deductions, reverse o2m aliases `directus_users.account` and `gp_orgs.account`. `gp_apps_approvals`: add `user_created` alongside `user` (gp-auth still writes `user`).
- Knex migration: backfill `gp_accounts` for every user, backfill `account_id` from `userId` / `user_id`, insert-triggers on `directus_users` / `gp_orgs`, XOR check, uniques (`accounts.user`, `accounts.org`, `members(org, user)`, `credits.account_id`), FK actions (accounts cascade, `gp_tokens.user_created` cascade).
- Knex migration: replace `gp_apps_approvals` `UNIQUE(user, app)` with `UNIQUE(user_created, app, account_id)`. Ships here, not in phase 2: Directus is deployed once, so the old key would still be in place when gp-auth starts creating per-account approvals.
- Permissions migration: the per-table rules from `design.md`.
- GitHub sync: fetch org memberships + roles with the user's token only, new sync lib (upsert gp_orgs + gp_accounts + gp_org_members, promote to admin but never demote, on leave: delete membership + that member's org tokens and approvals), wire into sign-in hook, sign-up hook, sync-github-data endpoint.
- Hooks: gp-tokens create (payload `account_id` = own account or org where role is admin/member), adopted-probe (tag prefix from account owner: org name or github_username; reset fields on `account_id` -> null), gp_org_members update (per-field: `role` by org admin, `notification_preferences` on own row), notifications (org events fan out to members per their prefs, most org notifications off by default).
- Endpoints: adoption-code + local-adoption resolve the owner (org adoption token; `activeOrg` param accepted only from an admin of that org), applications endpoint gains `accountId` scoping (approvals are bound to a specific account). Every endpoint taking `userId` (adoption-code, applications, credits-timeline) accepts `accountId` as the primary parameter, with `userId` kept as a `// PHASE4: remove` shim.
- gp-orgs read hook: strip `adoption_token` for non-admin roles.
- Credits: probe credits cron resolves `github_id` from the probe's account owner, org balance initialized from unconsumed additions when an org is first created, low-credits notifies org members. `SOURCE_ID_TO_TARGET_ID` redirect stays.
- Dual-write: every writer that sets `userId` / `user_id` also sets `account_id` (adoption, signup credits, deductions writer stays API-side until phase 2).
- Seeds + unit tests + e2e for permissions and sync.

## Phase 2: gp-api, gp-auth, gp-dash switch to account_id

Readers move to the new columns. No new UI. Directus is not deployed again here, so everything it needs for the new shape - schema,
keys, permissions, endpoint parameters - has to be in phase 1. Accepted: until this phase ships, an org token created via raw API bills its creator personally.

- gp-api: `auth.ts` selects `account_id`, billing target = token's `account_id`; `credits-master` consumes by `account_id`; deductions written with `account_id`; `adopted-probes` joins accounts -> users / orgs (prefix, adoption token, public probe tag via COALESCE); `adoption-token` includes org adoption tokens in the token map. Notifications are posted with `account` instead of `recipient`, and the API-side notification dedup (currently by `recipient` + `message`) switches to an account-aware check - for an org probe the stored recipients are the org admins.
- gp-auth: consent flow gets the account context (cookie or param), validates membership + role (viewer can't approve for org), writes `account_id` + `user_created`; the "already approved" check and issued tokens are per account. It may stop writing `user` - the phase 1 trigger fills it - but it must keep sending the approving user in `user_created`: an approval with no user at all is rejected.
- gp-dash: `getUserFilter` and probes / credits / tokens queries read `account_id` instead of `userId` / `user_id`. Deploy together with or after the phase 1 permissions migration (filters return empty otherwise).

## Phase 3: gp-dash org UI

User-visible org support. Directus is deployed here too: a data migration converts the redirect accounts into orgs, and the
redirect code ships removed in the same deploy.

- Directus migration - sponsor account -> org conversion, one-off for the six `SOURCE_ID_TO_TARGET_ID` entries (railwayapp,
  iplocate, vidalytics, arexico, fbw-networks, recurvelabs). Runs before the dash deploy, so the owners see the result in the org
  UI immediately. Per org, in order:
  1. create the org if the phase 1 sync has not already (create-if-missing by `github_id`; the account trigger claims any
     unconsumed additions);
  2. vidalytics only: re-point additions from the deleted redirect target (`github_id` 219827779 -> 21207279) before the org is
     created - its user is gone from GitHub and from our DB, so there is nothing else to move;
  3. move the addition history to the org `github_id` (keeps the sponsor bonus continuity and the sponsors-cron matching);
  4. merge the balance into the org account (the org may already hold claimed credits; `UNIQUE(account_id)` allows one row) and
     move the deductions;
  5. move ALL tokens - personal and app ones together with their approvals, so consent and billing stay on the same account;
  6. move all probes (`account_id` -> org account, `userId` kept until phase 4);
  7. add the user as an org admin (or promote the existing membership). Safe against the sync: all five living users are public
     members of their orgs, and the sync never demotes.
- Remove `SOURCE_ID_TO_TARGET_ID` and `redirectGithubId` from the code - new sponsorships resolve to the orgs natively. Works only
  together with the migration above: removing the code alone would strand new org sponsorships as unconsumed additions.
- Org store: memberships + roles loaded on login, own account id resolved via `readMe` expansion, `activeOrg` in store + cookie.
- Header: "Act as organization" button + select modal, active org shown instead of the username.
- Probes list + detail: org view, edit controls and adopt only for admin (role-gated).
- Credits page: org stats and history in org view.
- Tokens page: own tokens and approvals inside the org, generate token creates an org item, disabled for viewers.
- Settings: "Organization" section (only admin sees, copies, and regenerates the org adoption token).
- Admin-only "Organization" page: org info, members list, role management.
- Hint on the org page when the org has no admins: it hasn't approved the `globalping` OAuth app in its GitHub settings, so roles are invisible to us.
- e2e.

## Phase 4: cleanup

Remove the transition scaffolding. Only after phases 1-3 have soaked in prod.

- Drop the `*_fulfill_account` triggers FIRST, with `migrate:one`, and only then let `schema:apply` drop the columns. Dropping a column a trigger reads does not disable the trigger - every write to the table fails with `Unknown column ... in 'NEW'` until it is gone, and `schema:apply` runs before `migrate`.
- Drop old columns: `gp_probes.userId`, `gp_credits.user_id`, `gp_credits_deductions.user_id`, `gp_apps_approvals.user`.
- Remove dual-write / dual-read support from extensions and gp-api.
- Drop `default_prefix`, `deprecated_prefix`, `github_organizations` from `directus_users`; remove the tag-prefix-selector interface, simplify gp-tags. Tag prefixes stop being stored/validated: the prefix is generated from the probe's account owner (org name or github_username) when the tag is built.

Added while implementing phase 1 (remove or update in phase 4):

- Triggers `gp_tokens_fulfill_account`, `gp_apps_approvals_fulfill_account` (`20260731GP`) - fulfill `account_id` for the rows gp-auth writes. Drop once it sets the account itself, in phase 2.
- `gp_apps_approvals_fulfill_account` also copies `user` -> `user_created`; drop together with the `user` column.
- Credits triggers (`20260731GP`) write both `user_id` and `account_id`; drop `user_id` from the inserts.
- `after_gp_credits_update` writes deductions with both; `gp_credits_deductions` keeps both `unique_user_id_date` and `gp_credits_deductions_account_id_date_unique` - drop the legacy one.
- `gp_credits`, `gp_credits_deductions`, `gp_probes`, `gp_tokens`, `gp_apps_approvals` keep legacy indexes on the old user columns - drop with the columns. `gp_apps_approvals_user_index` was added in `20260731GP` only to free the `user` foreign key from the unique key being replaced.
- `gp_probes` update permission validation keeps the `userId _null` clause next to `account_id _null`; `userId` stays in the allowed update fields (dash sends it until phase 2).
