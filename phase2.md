# Phase 2: gp-api, gp-auth, gp-dash switch to account_id

Process: one repo at a time, in the order below, each in its own `orgs` branch/worktree. Per step: change, unit + integration
tests, verify on the dev instance (Directus 18055 with phase 1 applied, gp-api 3000, dash 13010). Nothing is pushed.

## What phase 1 already gives us

- `gp_accounts (id, user, org)` - exactly one of `user` / `org`, one account per user, created by a trigger.
- `account_id` on `gp_probes`, `gp_tokens`, `gp_credits`, `gp_credits_deductions`, `gp_apps_approvals`, backfilled and dual-written.
- `gp_orgs (name, github_id, adoption_token, extra_adoption_tokens, public_probes)`, `gp_org_members (org, user, role)`.
- `gp_apps_approvals`: `user_created` alongside `user`, `UNIQUE(user_created, app, account_id)`.
- Directus endpoints already accept `accountId`; `userId` still works as a shim.

## Contract for this phase

- **An org-owned row has `userId` / `user_id` / `user` NULL.** Only `account_id` identifies its owner. Any reader still joining
  by the legacy column silently treats such a row as ownerless - that is the bug this phase removes.
- **A personal row keeps both columns** filled, so a reader that has not switched yet keeps working. Nothing here is a breaking
  deploy for the other services.
- **Directus is not deployed in this phase.** Anything it would have to provide had to ship in phase 1.
- No new UI. The dash still shows only the personal account; the org switcher is phase 4.

## 1. gp-api (`globalping`)

1. **`auth.ts`**: select `account_id` from `gp_tokens`, return it from `validate()`, carry it on `ctx.state.user` as
   `accountId`. A token whose `user_created` is NULL keeps a NULL account (client-credentials pairs) - stays
   "no owner", never an error. A session cookie carries the user's own account as the `user_account_id` claim (phase 1); the sessions issued
   before that do not, so a `gp_accounts` lookup stays as a `// PHASE5: remove` fallback for one session lifetime.
1a. **Acting as an org**: the dashboard sets `gp_active_account` on `.globalping.io` when the user switches (phase 4 UI, the
   readers ship now). It is a plain cookie - the browser can put anything in it - so it is authorized on every request:
   the account must be the user's own or an org where their role is admin or member, cached for a minute, and anything that
   does not pass silently falls back to the personal account. Per device by construction: the choice lives in the browser,
   nothing is stored server-side, so a laptop can act as the org while the phone stays personal.
2. **Credits**: `credits.consume` / `getRemainingCredits` and `CreditsMaster` key on `account_id` instead of `user_id`
   (`gp_credits.account_id` is unique). Callers: `rate-limiter-post.ts`, `get-limits.ts`. Deductions need no work - gp-api only
   decrements `gp_credits`, the `after_gp_credits_update` trigger writes the deduction row with both columns.
3. **`adopted-probes.ts` `fetchDProbes`**: join `gp_accounts` on `gp_probes.account_id`, then `directus_users` / `gp_orgs`:
   - owner name for the global tag: `COALESCE(org.name, user.default_prefix)`, gated by `COALESCE(org.public_probes, user.public_probes)`;
   - `deprecated_prefix` only for personal accounts (dropping it would silently take the old `u-<name>` from everyone in a grace period);
   - the current `status = 'active'` condition moves onto the account's user, so probes of banned users still lose their overrides,
     and an org account is never filtered out by it;
   - `adoptionToken`: `COALESCE(org.adoption_token, user.adoption_token)`.
   - `getUpdatedProbes` sets `owner: { id: <account_id> }` (only `metrics.ts` reads it).
4. **`adoption-token.ts`**: the token map covers org adoption tokens too - users' `adoption_token`, orgs' `adoption_token` and
   the entries of `gp_orgs.extra_adoption_tokens`. The map value becomes the account id, and `adopt-by-token` is called with it.
5. **Notifications**: post `account` instead of `recipient`, and the dedup check (today `recipient` + `message` + today's date)
   becomes account-aware - for an org probe the stored recipients are its admins, so dedup by the account's notifications.

Verify: unit + integration suites; on dev - adopt a probe into an org, see its tags/location overrides applied, its global tag
`u-<org name>` follow the org's `public_probes`, a measurement with an org token bill the org's credits.

## 2. gp-auth (`globalping-auth`)

1. The account is picked on the approval screen, never taken from the browser state: gp-auth does not read
   `gp_active_account` at all. The screen sends the chosen account as a request parameter; with nothing sent the approval is
   personal, taken from the session's `user_account_id` claim (same `// PHASE5: remove` lookup fallback as gp-api). That keeps
   the old dashboard working against the new gp-auth, so it can be deployed first.
1a. **The screen is skipped only when there is nothing to pick.** A remembered approval short-circuits it as before, but only
   for a user with no org to act for - the orgs they picked in the dashboard (`directus_users.selected_orgs`) crossed with the
   memberships where their role is admin or member. Everyone else confirms the account on every explicit login: the choice is
   theirs, it can differ from the last one, and a stale cookie can never make it silently.
2. Validate it before approving: the account must be the user's own or an org where they are admin or member - a viewer cannot
   approve for the org.
3. `gp_apps_approvals`: write `account_id` + `user_created`; `user` may be left to the phase 1 trigger, but `user_created` is
   required - an approval with no user is rejected. The "already approved" lookup keys on `(user_created, app, account_id)`.
4. Tokens issued for the approval carry the same `account_id`, so gp-api bills the right account.

Verify: unit + integration suites; on dev - run the real consent flow against the local dash and Directus, approve for the
personal account and for an org, check both rows and both tokens.

## 3. gp-dash (`globalping-dash`)

1. `useUserFilter` learns the account: `account_id` for probes / credits / tokens / deductions / approvals, `recipient` stays a
   user id, `github_id` stays as is. The account comes from the user object Directus already returns.
2. Every call site follows the field it filters on - 8 `userId`, 8 `user_id`, 2 `user_created` today.
3. Requests that pass `userId` to the Directus endpoints (adoption, applications, credits timeline) pass `accountId` instead.

Verify: `pnpm test`, then the dev dash on 13010 - probes, credits, tokens, applications and notifications pages show the same
data as before the switch.

## Deploy order

gp-api and gp-auth are independent of each other and can go any time after phase 1. gp-dash must go **with or after** the phase 1
permissions migration - `account_id` filters return empty until it is applied.
