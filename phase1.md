# Phase 1: Directus org support

Process: one step at a time. TDD where applicable (per-extension mocha), verify validity on the dev instance, verify performance on the dev instance, review. Then user reviews, commits and confirms next start of work with next step.

Note: the dev DB contains leftovers from an earlier schema experiment (`org_id`/`orgId` columns on data tables). Step 1's `schema:apply` removes them automatically (the snapshot is the source of truth).

## Steps

1. **Schema (snapshot yml)**
   - `gp_accounts`: `id`, `user` (m2o directus_users, unique), `org` (m2o gp_orgs, unique)
   - `gp_orgs`: `id`, `name`, `github_id` (unique), `adoption_token` (unique); `gp_org_members`: `org`, `user`, `role` (viewer | member | admin), `notification_preferences` (json)
   - `account_id` (m2o gp_accounts, indexed) in gp_probes, gp_tokens, gp_apps_approvals, gp_credits, gp_credits_deductions
   - `gp_apps_approvals.user_created` added alongside `user`
   - reverse o2m aliases: `directus_users.account`, `directus_users.memberships`, `gp_orgs.account`, `gp_orgs.members`
   - apply + snapshot round-trip on dev

2. **Knex migration: data + constraints**
   - backfill `gp_accounts` for every user; backfill `account_id` from `userId`/`user_id`; approvals `user_created` = `user`
   - insert-triggers on `directus_users`/`gp_orgs` creating account rows
   - XOR check on gp_accounts; `UNIQUE(org, user)` on gp_org_members; `UNIQUE(account_id)` on gp_credits
   - FK actions: accounts cascade from user/org; `gp_tokens.user_created` ON DELETE CASCADE

3. **Permissions migration** - the per-table rules from `design.md` (MY_ACCOUNTS, MINE_OR_ADMIN, org/members rules, additions github_id branch)

4. **Seeds** - org data to verify every later step against:
   - `john-org` and `turk-org`; existing john and turk are admins of their orgs
   - new users john2 (admin), john3 (member), john4 (member), john5 (viewer), john6 (viewer), names "John 2" etc.; same set for turk (turk2..turk6)
   - each new user gets a single item in probes, tokens, approvals (where the role allows it)

5. **GitHub client**:
   - `getGithubOrganizations()` merges two sources, both incomplete alone: `/user/memberships/orgs` (roles + private memberships, but orgs restricting our OAuth app are silently missing) and `/user/{id}/orgs` (includes the restricted ones, public memberships only, no roles - added as `member`). Both go with the user's token, there is no fallback to ours. Any failure, including a missing token, throws an explicit error asking the user to sign in again.
   - Both lists are paginated (`per_page=100` + the `Link` header), because an org missing from them means the membership is removed - a truncated first page would delete the rest.
6. **Sync lib** (`lib/src/sync-orgs.ts`): upsert gp_orgs (+account via trigger) and gp_org_members from memberships; members of an org that restricts our OAuth app are synced as `member` and nobody there can become admin until the org approves the app (org still usable for member actions: create tokens, approve apps; adopting probes stays unavailable there since it is admin-only); promote to admin, never demote; a membership missing from the list is removed: with a complete list that only happens when the user left or the org cut off our app, and a failed list throws before any of this; on leave: delete membership + that member's org tokens and approvals; init org credits from unconsumed additions on first org creation

6a. **Unmask the GitHub token for internal reads**: the `directus-users` hook masks `github_oauth_token` in `action('users.read')`, and Directus emits it for internal `ItemsService` reads too - so the sync was sending `Bearer ********`, getting a 401 and silently falling back to the public orgs list (verified on the dev instance; explains the stale prod data). Fixed with `readOne(id, {}, { emitEvents: false })` in the sign-in hook and the sync-github-data repository. Without it the new code would throw `GithubTokenRejectedError` for every user.

6b. **Allow filtering `gp_tokens` by `account_id`**: the `gp_tokens.items.read` filter hook throws `Filtering is not available` for anything but `id`/`user_created`/`app_id` (verified live), which would break the org tokens page and the org token cleanup. `account_id` added to the allowed list.

7. **Sync wiring**: sign-in hook (login), sign-up hook (registration), sync-github-data endpoint. A failed sync throws: the login path only logs it (Directus swallows action errors), the endpoint shows the message to the user, who can sign in again to get a fresh token. Note: `auth.login` is not emitted on session refresh, so a permanently logged-in user never re-syncs - decide on a cron or a throttled sync.

8. **gp-tokens hook**: on create, validate `account_id` - must be my personal account or an org where my role is admin/member (viewer excluded). Fulfillment is done by a DB trigger, not the hook

9. **adopted-probe hook**: tag prefix from account owner (org name or github_username); reset user fields on `account_id` -> null; dual-write `userId` on adoption paths

10. **gp_org_members update hook**: `role` only by an admin of that org; `notification_preferences` only on own row

10a. **gp-orgs read hook**: strip `adoption_token` unless the requester is an admin of that org (permission fields can't differ per role; pattern = `github_oauth_token` masking in directus-users hook)

11. **Notifications**: org-event fan-out to members per `notification_preferences` (most org notifications off by default)

12. **Adoption endpoints**: adoption-code + local-adoption resolve owner (org adoption token; `activeOrg` param accepted only from an admin of that org - members and viewers can't adopt into the org); `createAdoptedProbe` sets the org `account_id` when adopting into an org (personal one is fulfilled by the DB trigger), dual-writes `userId`

13. **Applications endpoint**: `accountId` scoping for list and revoke

14. **Credits**: probe-credits cron resolves `github_id` from the probe's account owner; low-credits notifies org members

15. **e2e** for permissions and sync
