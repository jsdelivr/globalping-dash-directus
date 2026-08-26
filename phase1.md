# Phase 1: Directus org support

Process: one step at a time. TDD where applicable (per-extension mocha), verify validity on the dev instance, verify performance on the dev instance, review. Then user reviews, commits and confirms next start of work with next step.

Note: the dev DB contains leftovers from an earlier schema experiment (`org_id`/`orgId` columns on data tables). Step 1's `schema:apply` removes them automatically (the snapshot is the source of truth).

## Compatibility contract

Phase 1 is deployed while every other service still runs its old version, and each of them switches to accounts on its own
schedule. So both shapes have to work at the same time, in both directions:

- a writer that still sends only `userId` / `user_id` / `user` must end up with `account_id` filled;
- a writer that already sends only `account_id` must end up with the legacy column filled too, so the old readers keep seeing
  the row - and must not be rejected by a NOT NULL column or an input schema that only knows the old parameter;
- a reader of either shape sees the same data.

How the code is written for it:

- account-first: the real logic resolves and stores `account_id`, and reads it back;
- everything that exists only to keep the old shape alive - dual-writes, legacy input parameters, fulfillment triggers - is a
  separate block marked `// PHASE4: remove`, never woven into the main path;
- phase 4 is then a grep for the marker and a delete, not a rewrite.

## Steps

1. **Schema (snapshot yml)**
   - `gp_accounts`: `id`, `user` (m2o directus_users, unique), `org` (m2o gp_orgs, unique)
   - `gp_orgs`: `id`, `name`, `github_id` (unique), `adoption_token` (unique); `gp_org_members`: `org`, `user`, `role` (viewer | member | admin), `notification_preferences` (json)
   - `account_id` (m2o gp_accounts, indexed) in gp_probes, gp_tokens, gp_apps_approvals, gp_credits, gp_credits_deductions
   - `gp_apps_approvals.user_created` added alongside `user`
   - reverse o2m aliases: `directus_users.account`, `directus_users.memberships`, `gp_orgs.account`, `gp_orgs.members`
   - `directus_users.selected_orgs` (json, default `[]`): the orgs the user picked to work with. The sync keeps creating every org
     GitHub reports, so this is what the dashboard switcher lists and what the stats count as used - a user with twenty orgs sees
     the one they care about. Ships here because Directus is deployed once: the column and its permission have to be in place
     before the phase 3 UI can write it.
   - apply + snapshot round-trip on dev

2. **Knex migration: data + constraints**
   - backfill `gp_accounts` for every user; backfill `account_id` from `userId`/`user_id`; approvals `user_created` = `user`
   - insert-triggers on `directus_users`/`gp_orgs` creating account rows
   - XOR check on gp_accounts; `UNIQUE(org, user)` on gp_org_members; `UNIQUE(account_id)` on gp_credits
   - FK actions: accounts cascade from user/org; `gp_tokens.user_created` ON DELETE CASCADE
   - replace `gp_apps_approvals` `UNIQUE(user, app)` with `UNIQUE(user_created, app, account_id)`, so the same person can approve an app for themselves and for an org separately; the `user` foreign key needs a plain index of its own first

3. **Permissions migration** - the per-table rules from `design.md` (MY_ACCOUNTS, MINE_OR_ADMIN, org/members rules, additions github_id branch)

4. **Seeds** - org data to verify every later step against:
   - `john-org` and `turk-org`; existing john and turk are admins of their orgs
   - new users john2 (admin), john3 (member), john4 (member), john5 (viewer), john6 (viewer), names "John 2" etc.; same set for turk (turk2..turk6)
   - each new user gets a single item in probes, tokens, approvals (where the role allows it)

5. **GitHub client**:
   - `getGithubOrganizations()` merges two sources, both incomplete alone: `/user/memberships/orgs` (roles + private memberships, but orgs restricting our OAuth app are silently missing) and `/user/{id}/orgs` (includes the restricted ones, public memberships only, no roles - added as `member`). Both go with the user's token, there is no fallback to ours. Any failure, including a missing token, throws an explicit error asking the user to sign in again.
   - Both lists are paginated (`per_page=100` + the `Link` header), because an org missing from them means the membership is removed - a truncated first page would delete the rest.
6. **Sync lib** (`lib/src/sync-orgs.ts`): upsert gp_orgs (+account via trigger) and gp_org_members from memberships; members of an org that restricts our OAuth app are synced as `member` and nobody there can become admin until the org approves the app (org still usable for member actions: create tokens, approve apps; adopting probes stays unavailable there since it is admin-only); promote to admin, never demote; a membership missing from the list is removed: with a complete list that only happens when the user left or the org cut off our app, and a failed list throws before any of this; on leave: delete membership + that member's org tokens and approvals (database trigger); unconsumed sponsorship additions are claimed when the org is created (database trigger)

6a. **Unmask the GitHub token for internal reads**: the `directus-users` hook masks `github_oauth_token` in `action('users.read')`, and Directus emits it for internal `ItemsService` reads too - so the sync was sending `Bearer ********`, getting a 401 and silently falling back to the public orgs list (verified on the dev instance; explains the stale prod data). Fixed with `readOne(id, {}, { emitEvents: false })` in the sign-in hook and the sync-github-data repository. Without it the new code would throw `GithubTokenRejectedError` for every user.

6b. **Allow filtering `gp_tokens` by `account_id`**: the `gp_tokens.items.read` filter hook throws `Filtering is not available` for anything but `id`/`user_created`/`app_id` (verified live), which would break the org tokens page and the org token cleanup. `account_id` added to the allowed list.

7. **Sync wiring**: the sync is triggered from the `auth.jwt` filter, which fires on login and on every session refresh (~once a day per active tab) - `auth.login` alone would never re-sync a permanently logged-in user. It runs in the background: the token is issued immediately, a failure is only logged, the next login/refresh retries. Syncs on every login and refresh; concurrent syncs of the same user are safe - the unique keys catch the races. The sync-github-data endpoint (manual button) also runs `syncOrganizations` and shows the error to the user. A separate sign-up sync is not needed: the first login emits `auth.jwt` too.

7a. **Members cron** (`check-members-cron-handler`, daily at 02:00): a user who never opens the dashboard never re-syncs, so their org tokens would survive leaving the org. For each org that has org tokens or app approvals: find a checker (member whose token passes the authoritative self check), read every member's org list in one GraphQL query with the checker's token (a fellow member sees private memberships), resolve inconclusive members (stale login, 100+ orgs) by their own token first, then via REST through the checker. Leavers are removed; the DB trigger cleans their org tokens and approvals. An org that restricts the OAuth app or has no working token is reported in the operation output and left untouched.

8. **gp-tokens hook**: on create, validate `account_id` - must be my personal account or an org where my role is admin/member (viewer excluded). Fulfillment is done by a DB trigger, not the hook

9. **adopted-probe hook**: tag validation keeps working off `userId` and `github_organizations` as today (phase 4 stops reading the stored prefix and generates it from the probe's account owner); reset user fields on `account_id` -> null; dual-write `userId` on adoption paths

10. **gp_org_members update hook**: `role` only by an admin of that org; `notification_preferences` only on own row. Required, not a nicety: the permission covers both fields at once, so on its own it lets a member set `role` on their own row and promote themselves to admin (confirmed on the dev instance), and lets an org admin edit someone else's notification preferences. Directus can't split an action's fields into separate rules within one policy, so the hook is the only place for it - cover both cases with tests

10a. **gp-orgs read hook**: strip `adoption_token` unless the requester is an admin of that org. Until it lands every member reads the org's adoption token (confirmed on the dev instance) - permission fields can't differ per role, so the hook is the only place for it; pattern = `github_oauth_token` masking in directus-users hook

11. **Notifications**: senders address the owner, the hook resolves who actually gets notified.

    11a. Senders pass a virtual `account` field instead of `recipient` (the row's `account_id`); the `notifications.create` filter resolves it: a user account becomes `recipient` and flows through the existing personal-preferences logic untouched; an org account fans out to the org ADMINS only (members and viewers never receive org notifications), one notification per admin, the original payload is cancelled. `account` never reaches the database - `recipient` stays a user FK. Payloads with `recipient` stay supported permanently: notifications addressed to a specific user (welcome, username change) use `recipient`, notifications about an owned item use `account`.

    11b. Admin org preferences live on their `gp_org_members.notification_preferences`, independent of their personal config; the types, the shape (`enabled`/`emailEnabled`/parameter), the defaults, and the validation are exactly the same as the personal ones - reuse `notification-types.ts` and share the joi schema; validated in the gp-org-members update hook. `email_status` of a fanned-out notification is computed from that admin's org preferences.

    11c. Switch the senders to `account`: create-adopted-probe (adopted/unassigned), firmware check, expired adoptions. Credits senders are handled in step 14.

12. **Adoption endpoints**: adoption-code + local-adoption resolve owner (org adoption token; `activeOrg` param accepted only from an admin of that org - members and viewers can't adopt into the org); `createAdoptedProbe` sets `account_id` on every write path - the org one when adopting into an org, the adopting user's otherwise - and dual-writes `userId`.

    Org adoption ships here but stays dormant: only the phase 3 dashboard sends `activeOrg`, and Directus is not deployed again in
    between. That ordering also means an org probe never exists while gp-api still joins probes by `userId` - it moves to accounts in
    phase 2, one phase before the UI that can create such a probe. The gap is only reachable by calling the endpoint by hand before
    phase 2, same class as an org token created via raw API.

13. **Applications endpoint**: list and revoke scope by `account_id`. Also fixes a phase-2 hazard: today revoke deletes by `user` + `app`, which would take an org approval down together with the personal one once gp-auth starts creating them.

13a. **Legacy `userId` shim in endpoints**: adoption-code (`send-code`, `verify-code`, `adopt-by-token`), applications and credits-timeline accept `accountId` as the primary parameter; `userId` stays as a `// PHASE4: remove` shim resolved into the personal account via `getUserAccountId`, exactly one of the two is required. Ships in phase 1 because Directus is not deployed again before the callers switch.

14. **Credits**: probe-credits cron resolves `github_id` from the probe's account owner; low-credits notifies org members

15. **e2e** for permissions and sync

**Deploy**: three steps, in this order.

1. `pnpm migrate:one:production` - applies `20260728GP` alone: it converts `gp_credits_deductions.user_id` to varchar and adds the
   `gp_apps_approvals.user` index. Both are column changes the snapshot declares but Directus can't apply itself: it rewrites a
   char column as varchar whenever it alters one, and a type change is rejected on a foreign key column. Runs Directus's
   `migrate:up`, which applies the first migration above the last applied one.
2. `pnpm schema:apply:production` - adds the org collections and the `account_id` columns, and makes `user_id` nullable, which it
   can now do because the column is varchar.
3. `pnpm migrate:production` - the remaining migrations, then restart Directus.

After the deploy, `SELECT COUNT(*) FROM gp_probes WHERE userId IS NOT NULL AND account_id IS NULL` must be 0, and stay 0 - phase 2
resolves a probe's owner through the account alone, so a probe with an owner but no account is invisible to it. Nothing writes such a
row: the backfill fixed the old ones and `createAdoptedProbe` sets both. Editing `userId` by hand in the admin app would.

A fresh database needs no special steps - `init.sh` order works as is. The snapshot creates the column nullable right away, so
nothing has to alter it, and `20260728GP` only converts the type, which keeps every environment on the same column.
