# Phase 5: cleanup

Process: one step at a time, in the order below. Per step: grep the marker or name the step gives, change, unit tests, e2e on stack 1 (stop its api first, full suite at the end of the phase), review. Then the user reviews, commits and confirms the next step. Nothing is pushed by an agent.

Design: `plan.md` "Phase 5: cleanup" is the contract, this file is the order and the exact places. Where the two disagree, `plan.md` wins.

## Preconditions

- Phases 3 and 4 are merged and deployed: directus #197, dash #235, gp-api #933, globalping.io #214, chat-bots #135, cli #206. All six were still OPEN on 2026-11-02.
- The deployed OAuth approval screen posts `accountId` (phase 4, 5.2): step 7 makes it required in gp-auth.
- Prod check before step 1: `SELECT COUNT(*) FROM gp_probes WHERE userId IS NOT NULL AND account_id IS NULL` is 0, the same for `gp_credits.user_id`, `gp_credits_deductions.user_id`, `gp_apps_approvals.user` against `account_id`, and `gp_apps_approvals` has no row with `user_created IS NULL`. A non-zero count is a bug of phases 1-4, fix it before dropping anything.

## What goes, grouped

Every `// PHASE5` marker in the four repos (2026-11-02): directus 42, gp-api 1, gp-auth 2, dash 0. `git grep -n PHASE5` in each worktree is the checklist; a step is done when its markers are gone.

## Steps

### 1. Directus schema: legacy columns and triggers

Order matters inside this step; it is the deploy order too (`plan.md`).

1.1 A knex migration, run alone with `migrate:one` BEFORE `schema:apply`: drop the triggers that read the legacy columns, in `20261029GP-add-account-id-to-data-tables.js` - `gp_tokens_fulfill_account`, `gp_apps_approvals_fulfill_account`, `gp_probes_fulfill_account`, `gp_probes_fulfill_account_on_update`. Recreate `after_gp_credits_update` (`20261029GP:86`) without `user_id` in its insert, and the credits triggers of `20240131GP-add-credits-triggers.js` the same way (`after_gp_credits_additions_insert` and whatever else writes `user_id`; read the file). Drop the legacy unique `unique_user_id_date` on `gp_credits_deductions` (`20240131GP:39`); `gp_credits_deductions_account_id_date_unique` stays. Drop `gp_apps_approvals_user_index` (`20261026GP-prepare-snapshot-columns.js`).

1.2 Snapshot: remove the fields `gp_probes.userId`, `gp_credits.user_id`, `gp_credits_deductions.user_id`, `gp_apps_approvals.user` (fields, relations and the `many_field` entries, `snapshots/collections-schema.yml`). Make `account_id` NOT NULL on `gp_apps_approvals`, `gp_credits`, `gp_credits_deductions`, and `gp_apps_approvals.user_created` NOT NULL. `gp_probes.account_id` and `gp_tokens.account_id` stay nullable (unadopted probes, client-credentials tokens). Remove `directus_users.github_organizations`. `default_prefix` and `deprecated_prefix` STAY. Add `gp_orgs.deprecated_prefix` (string, nullable): the org counterpart of the grace period, set when the org is renamed on GitHub while `gp_orgs.public_probes` is on.

1.3 Permissions migration: remove `github_organizations` from the user read fields (`20240104GP-add-user-permissions-to-read-gh-data.js` added it); remove the `userId _null` clause and `userId` from the `gp_probes` update permission (phase 1 note in `plan.md`). Grep the migrations for `userId`, `user_id`, `github_organizations` to find every rule that names them.

1.4 Low-credits legacy flag: `gp_credits.low_credits_notified` still holds the master-era `'0'`/`'1'` on rows the phase 3 cron never rewrote (2104 and 411 on the 2026-10-27 dump), and `parseNotifiedList` (`operations/low-credits-cron-handler/src/repositories/directus.ts:29-37`) reads them. The conversion was kept out of phase 1 because the master cron kept writing the flag while the old container was alive in the deploy window; in phase 5 the old container runs phase 4 code, which writes lists only, so a knex migration in the normal `migrate` step is safe: `'0'` -> `'[]'`, `'1'` -> `JSON_ARRAY(<owner user id via gp_accounts>)` (every `'1'` left is a personal account already notified at a low balance - the new cron rewrites a `'1'` to `'[]'` as soon as the balance goes above the threshold - so `'[]'` here would send those users a second email). Compare as strings (`low_credits_notified IN ('0', '1')`): a numeric compare on the `longtext` column fails with ERROR 1292 under `STRICT_TRANS_TABLES` on the `'[]'` rows. Then `parseNotifiedList` goes.

1.5 Seeds: `02-user.js`, `05-newuser.js`, `12-manual-additions.js`, `12-organizations.js` write `github_organizations`; `04-user-credits.js`, `12-manual-additions.js` filter by `user_id`; `03-user-probes.js` (every probe insert) and `12-organizations.js` write `userId` on probes; `10-user-notifications.js` filters probes by `userId`; `06-user-layout.js` and `07-admin-layout.js` show `userId.first_name` / `user_id.first_name` columns in the layouts - switch to the account.

1.6 Directus admin app interfaces: `interfaces/gp-tags` and `interfaces/tag-prefix-selector` read `github_username` + `github_organizations` for the prefix list. Rewrite both: `gp-tags` offers the owner's one name (org name or `github_username`, resolved through the probe's `account_id`); `tag-prefix-selector` (used by `directus_users.default_prefix`, snapshot line 940) offers `github_username` plus the stored value, the same set `validateDefaultPrefix` accepts (2.5).

1.7 Deploy order for this step on prod: `migrate:one` the 1.1 migration -> `schema:apply` -> `migrate` -> restart. The gap for `gp_apps_approvals.user` is accepted (`plan.md`).

### 2. Directus code: the account is the only owner

Grep `PHASE5` in `src/extensions`; each marker says what to do. In order:

2.1 `lib/src/accounts.ts`: `getRequestAccountId` becomes `validateAccountId(accountId, accountability, context, roles)` returning nothing; callers read `accountId` from the request. `getAccountOwnerFields` goes; `create-adopted-probe.ts:77` and `reset-fields.ts:39` write `account_id` only. `getUserAccountId` stays only if something still needs it (sign-up does, step 2.4).

2.2 Endpoints: `adoption-code` (`send-code`, `verify-code`, and the `user` input of `adopt-by-token`, gp-api already sends `account`), `applications` (also drop `user_id` from the list output and the `userId` fallback of revoke, `index.ts:137,164`), `credits-timeline`, `sponsorship-details`, `local-adoption` (`accountId` required): `accountId` is the only, required, owner input; `.xor('userId', 'accountId')` and `allowOnlyForCurrentUserAndAdmin` go. If `allowOnlyForCurrentUserAndAdmin` is then used only by `sync-github-data`, keep it there and nowhere else. `e2e-mocks/src/actions/globalping.ts:11` drops `userId`.

2.3 Hooks: `adopted-probe/src/index.ts:63,81` drop `userId`; `gp-tokens` `account_id` required in the type and in `validate-account.ts:16` (a missing one is an error, not a pass); `sign-up/src/index.ts:136` inserts `account_id` only.

2.4 `github_organizations` readers and writers: `sign-up/src/index.ts:84`, `sign-in/src/index.ts:165-171`, `sync-github-data/src/actions/sync-github-data.ts:36-53` stop writing it; the `/sync-github-data` response drops it (the dash reads it, step 4.2).

2.5 Tags and prefixes (`plan.md` "Tags", "default_prefix"):
- `adopted-probe/src/repositories/directus.ts:24` `getAccountTagPrefixes` returns the one owner name: `COALESCE(org.name, user.github_username)`. `validateTags` keeps checking only tags that are not already on the probe, so existing tags with other prefixes keep working.
- `directus-users/src/validate-fields.ts:52` `validateDefaultPrefix` becomes `Joi.string().valid(user.github_username, user.default_prefix)` (the stored value).
- `lib/src/deprecate-prefix.ts:33` `checkDefaultPrefix` validity set becomes `github_username` + the names of the orgs in `gp_org_members` for the user, instead of `github_organizations`. Users who keep an org name in `default_prefix` (40 on the 2026-10-27 dump) are untouched: nothing moves them into `deprecated_prefix`, their probes keep `u-<org>` next to the org's own probes, as today.
- Grace period for orgs: `sync-orgs.ts:44-45` renames `gp_orgs.name` today; when the org has `public_probes`, it also sets `gp_orgs.deprecated_prefix = <old name>` and posts `default_tag_change` with `account_id` = the org's account (the notifications hook fans it out to every org admin, `notifications/src/index.ts:55-57`; the type is not `configurableByUser`, so preferences never drop it). Do it as one conditional `UPDATE gp_orgs SET name = ?, deprecated_prefix = ? WHERE id = ? AND name = <old>` and notify only when a row changed: two members syncing at once both see the old name.
- `releaseDeprecatedPrefix(name)` (`deprecate-prefix.ts:16`) clears the name from `directus_users.deprecated_prefix` AND `gp_orgs.deprecated_prefix`, and is called wherever a name is taken as the current one: user rename (`checkDefaultPrefix`, already there), sign-up (`sign-up/src/index.ts:52` calls it already, but today it clears only `directus_users`), org create and org rename in `sync-orgs.ts` (new). It never touches `default_prefix`, so the 40 users above are not affected when their org is created or renamed. Otherwise an org renamed to `acme-corp` shares `u-acme-corp` with whoever still holds it in a grace period.
- Confirm: `sync-github-data/src/index.ts:60-78` clears `deprecated_prefix` for the `userId` in the link token; add an `orgId` variant (`link-generator.ts:38` `generateDefaultTagChangeLink` takes either) that clears `gp_orgs.deprecated_prefix`. The signed link stays the only credential, as for users; the dash page `pages/default-tag/confirm.vue` just forwards `data`, no change. No extra org UI: the admins get the link in the notification email, the same way users do.
- Notification text (`deprecate-prefix.ts:65`): the user message offers "confirm the new tag or choose a different default tag in settings"; after the reset the settings selector shows only `github_username` (phase 4 hides it when the two values match, `Personal.vue:86`), so the second option is dead - drop it. The org message is new: "The default tag of your organization <org> has changed from u-<old> to u-<new>. The old tag keeps working until you confirm the new one."; same `default_tag_change` type.

2.6 Unit tests of every touched extension; e2e: `permissions.spec.ts:28`, `organizations.spec.ts:309`, `applications.spec.ts:113`, `sign-up.spec.ts:36` (poll `account_id`), `db/triggers.spec.ts:87,100` (drop the fulfilling trigger tests), `test/e2e/utils.ts` (16 `userId`/`user_id` uses), and every spec that inserts `userId`/`user_id` rows (30 files, `grep -rln "userId\|user_id" test/e2e/tests`). Add: `accountId` missing -> 400 on each endpoint; a tag with a foreign prefix refused on create and accepted when already stored; `default_prefix` refused for an org name the user never had; an org rename with `public_probes` sets `gp_orgs.deprecated_prefix` and notifies the admins, without `public_probes` only renames; the confirm link clears it for a user and for an org; a user or org taking a name releases it from both tables; a user with an org name in `default_prefix` keeps it when the org is created or renamed.

### 3. gp-api

3.1 `src/lib/http/middleware/authenticate.ts:46-94`: drop `resolveAccount`, read `user_account_id` / `active_account_id` / `active_account_role` claims directly; delete `src/lib/accounts.ts` (`getUserAccountId` and its cache) if nothing else imports it. `src/lib/override/adopted-probes.ts:394`: `deprecatedPrefix` = `COALESCE(gp_orgs.deprecated_prefix, directus_users.deprecated_prefix)`; `defaultPrefix` (`:393`) and the `publicProbes` gating stay.

3.2 `migrations/dashboard/create-tables.js.sql`: drop `gp_probes.userId` (line 18), `gp_credits.user_id` + `gp_credits_user_id_unique` (92-94), `directus_users.github_organizations` (4); add `gp_orgs.deprecated_prefix` (99-106); `account_id` NOT NULL on `gp_credits`, `gp_credits_deductions`, `gp_apps_approvals`; `gp_apps_approvals.user_created` NOT NULL. Fixtures and tests that set `userId`/`user_id` (`test/tests/unit/credits-master.test.ts` 38 hits, `test/utils/fixtures.ts`, `test/tests/unit/auth.test.ts`, integration probes tests) follow.

3.3 Verify: lint, mocha, portman; e2e ipv4 on this Mac.

### 4. gp-dash

4.1 Nothing sends `userId` any more after phase 4; confirm with `git grep -n "userId" app` (only impersonation key parsing in `store/account.ts:10` should remain).

4.2 `github_organizations` leaves `types.ts:150` and `store/auth.ts:60`; the settings page stopped showing it in phase 4 (`components/settings/Personal.vue` reads only `github_username` from the `/sync-github-data` response). "Sync from GitHub" stays - it still runs the org sync.

4.3 Tags: `UserTagsBlock.vue` already offers one prefix (`getPrefixOptions`), and a saved tag keeps its own; add the warning `plan.md` asks for when an old tag is edited ("saving renames its prefix to <owner name>"), same place `format: 'v1'` is handled. The settings "Default tag prefix" selector already shows the two values; nothing to change there.

4.4 e2e in the directus repo (step 2.6 covers the specs).

### 5. gp-auth

5.1 `src/oauth/schema.ts:5`: `accountId` required on `POST /oauth/approve`. `src/oauth/route/authorize.ts:28`: drop the `gp_accounts` lookup, the cookie claim is the only source.

5.2 `migrations/create-tables.js.sql`: `gp_apps_approvals.account_id` and `user_created` NOT NULL (lines 90-91). Tests follow. Do NOT run the gp-auth tests against stack 1 (they flush its Redis); use their own compose.

### 6. Tests move and docs

6.1 Phase 1 org e2e over REST: what the UI can check at a reasonable cost moves to UI specs, the rest stays REST. Candidates: `organizations.spec.ts`, `permissions.spec.ts`, parts of `transfer-data.spec.ts` that `migrate-to-org.spec.ts` repeats.

6.2 `features/orgs`: mark phases 1-5 done in `plan.md`, remove "until phase 5" wording from `design.md:68-69` and `phase4.md:41,124`, add `gp_orgs.deprecated_prefix` to the `default_prefix` paragraph (`plan.md:75-87`, "`deprecated_prefix` stays as a column"), note the final tag rules once in `design.md`.

## Deploy order

1. Directus: `migrate:one` (1.1) -> `schema:apply` -> `migrate` -> restart. Everything else in Directus ships in the same deploy.
2. gp-api (3), gp-auth (5): any order after Directus; both only stop reading what is gone.
3. gp-dash (4): any time; it already sends `accountId`.

## Verification at the end

Full Playwright suite on stack 1; gp-api lint + mocha + portman + e2e ipv4; gp-auth suite in its own environment; `git grep PHASE5` empty in all four repos.
