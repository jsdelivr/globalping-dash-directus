# Orgs implementation plan

Design: see `design.md`. Rollout is 4 independently deployable phases: expand (1), switch readers (2), org UI (3), contract (4). Prod never breaks: old `user_id` columns keep working until phase 4, writers set both old and new columns during the transition.

## Phase 1: Directus supports orgs

All org operations become possible on the Directus side. Old `user_id` fields keep working, values are dual-written where needed. No UI yet.

- Schema (snapshot): `gp_orgs`, `gp_org_members` (role: viewer | member | admin, `notification_preferences`), `gp_accounts`, `account_id` in gp_probes / gp_tokens / gp_apps_approvals / gp_credits / gp_credits_deductions, reverse o2m aliases `directus_users.account` and `gp_orgs.account`. `gp_apps_approvals`: add `user_created` alongside `user` (gp-auth still writes `user`).
- Knex migration: backfill `gp_accounts` for every user, backfill `account_id` from `userId` / `user_id`, insert-triggers on `directus_users` / `gp_orgs`, XOR check, uniques (`accounts.user`, `accounts.org`, `members(org, user)`, `credits.account_id`), FK actions (accounts cascade, `gp_tokens.user_created` cascade).
- Permissions migration: the per-table rules from `design.md`.
- GitHub sync: fetch org memberships + roles (`/user/memberships/orgs`), new sync lib (upsert gp_orgs + gp_accounts + gp_org_members, promote to admin but never demote, on leave: delete membership + that member's org tokens and approvals), wire into sign-in hook, sign-up hook, sync-github-data endpoint.
- Hooks: gp-tokens create (payload `account_id` = own account or org where role is admin/member), adopted-probe (tag prefix from account owner: org name or github_username; reset fields on `account_id` -> null), gp_org_members update (per-field: `role` by org admin, `notification_preferences` on own row), notifications (org events fan out to members per their prefs, most org notifications off by default).
- Endpoints: adoption-code + local-adoption resolve the owner (org adoption token; `activeOrg` param accepted only from an admin of that org), applications endpoint gains `accountId` scoping (approvals are bound to a specific account).
- gp-orgs read hook: strip `adoption_token` for non-admin roles.
- Credits: probe credits cron resolves `github_id` from the probe's account owner, org balance initialized from unconsumed additions when an org is first created, low-credits notifies org members. `SOURCE_ID_TO_TARGET_ID` redirect stays.
- Dual-write: every writer that sets `userId` / `user_id` also sets `account_id` (adoption, signup credits, deductions writer stays API-side until phase 2).
- Seeds + unit tests + e2e for permissions and sync.

## Phase 2: gp-api, gp-auth, gp-dash switch to account_id

Readers move to the new columns. No new UI. Accepted: until this phase ships, an org token created via raw API bills its creator personally.

- gp-api: `auth.ts` selects `account_id`, billing target = token's `account_id`; `credits-master` consumes by `account_id`; deductions written with `account_id`; `adopted-probes` joins accounts -> users / orgs (prefix, adoption token, public probe tag via COALESCE); `adoption-token` includes org adoption tokens in the token map.
- gp-auth: consent flow gets the account context (cookie or param), validates membership + role (viewer can't approve for org), writes `account_id` + `user_created`; the "already approved" check and issued tokens are per account.
- directus migration: replace `gp_apps_approvals` `UNIQUE(user, app)` with `UNIQUE(user_created, app, account_id)`. Old unique must be dropped before gp-auth starts creating per-account approvals.
- gp-dash: `getUserFilter` and probes / credits / tokens queries read `account_id` instead of `userId` / `user_id`. Deploy together with or after the phase 1 permissions migration (filters return empty otherwise).

## Phase 3: gp-dash org UI

User-visible org support.

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

- Drop old columns: `gp_probes.userId`, `gp_credits.user_id`, `gp_credits_deductions.user_id`, `gp_apps_approvals.user`.
- Remove dual-write / dual-read support from extensions and gp-api.
- Drop `default_prefix`, `deprecated_prefix`, `github_organizations` from `directus_users`; remove the tag-prefix-selector interface, simplify gp-tags.
- `SOURCE_ID_TO_TARGET_ID` redirect is NOT removed (kept forever for now).

Added while implementing phase 1 (remove or update in phase 4):

- Triggers `gp_probes_fulfill_account`, `gp_tokens_fulfill_account`, `gp_apps_approvals_fulfill_account` (`20260801GP`) - fulfill `account_id` for rows created outside our extensions. Drop once every writer sets it.
- `gp_apps_approvals_fulfill_account` also copies `user` -> `user_created`; drop together with the `user` column.
- Credits triggers (`20260729GP`) write both `user_id` and `account_id`; drop `user_id` from the inserts.
- `after_gp_credits_update` writes deductions with both; `gp_credits_deductions` keeps both `unique_user_id_date` and `gp_credits_deductions_account_id_date_unique` - drop the legacy one.
- `gp_credits`, `gp_credits_deductions`, `gp_probes`, `gp_tokens`, `gp_apps_approvals` keep legacy indexes on the old user columns - drop with the columns.
- `gp_probes` update permission validation keeps the `userId _null` clause next to `account_id _null`; `userId` stays in the allowed update fields (dash sends it until phase 2).
