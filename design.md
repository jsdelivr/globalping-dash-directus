Default Directus multi-tenancy approach with a new orgs table and an account entity is the most valid for us.

### Directus updates:

  1. New `gp_orgs` table. Columns: `id, github_id, name, adoption_token`.
  2. New `gp_org_members` junction table. Columns: `id, org, user, role: viewer | member | admin, notification_preferences`.
  3. New `gp_accounts` table. Columns: `id`, `user` (o2o to directus_users), `org` (o2o to gp_orgs). Exactly one of `user`/`org` is set. A row is auto-created for every user and org (backfill migration + DB
trigger on insert) and removed via FK cascade, so an account always exists.
  4. New column `account_id` in data tables:
  - gp_probes (`userId` => `account_id`)
  - gp_tokens (+`account_id`, `user_created` stays to track creator)
  - gp_apps_approvals (+`account_id`; `user` => `user_created`, same as in gp_tokens)
  - gp_credits (`user_id` => `account_id`)
  - gp_credits_deductions (`user_id` => `account_id`)
  5. User policy permissions per table. Reusable filters:
  - `MY_ACCOUNTS` (personal or any of my orgs): `{ "_or": [ { "account_id": { "_in": "$CURRENT_USER.account.id" } }, { "account_id": { "_in": "$CURRENT_USER.memberships.org.account.id" } } ] }` — `_in` with a `$CURRENT_USER` path is a two-step search (1: get my account ids, 2: indexed filter by them), so it's efficient. `account` is a reverse o2m alias on directus_users/gp_orgs.
  - `MINE_OR_ADMIN` (personal, or admin of the owning org): `{ "_or": [ { "account_id": { "user": { "_eq": "$CURRENT_USER" } } }, { "account_id": { "org": { "members": { "user": { "_eq": "$CURRENT_USER" }, "role": { "_eq": "admin" } } } } } ] }`

New rules only (existing clauses like tokens' `app_id _null` / `user_created _eq $CURRENT_USER` stay as they are):

| Table | Action | New rule |
|---|---|---|
| gp_accounts (new) | read | `{ "_or": [ { "user": { "_eq": "$CURRENT_USER" } }, { "org": { "members": { "user": { "_eq": "$CURRENT_USER" } } } } ] }` - the dashboard reads its own account id from here, and `directus_users` gains the `account` and `memberships` aliases for it |
| gp_probes | read | filter => `MY_ACCOUNTS` |
| gp_probes | update | filter => `MINE_OR_ADMIN` |
| gp_tokens | create | Since validation is payload-only (no relational traversal), the payload check lives in the filter hook: `account_id` must be my personal account or an org where my role is admin/member. |
| gp_apps_approvals | — | no user policy (as today); the `applications` endpoint gains account scoping |
| gp_credits | read | filter => `MY_ACCOUNTS` |
| gp_credits_deductions | read | filter => `MY_ACCOUNTS` |
| gp_credits_additions | read | + `_or` branch: `{ "github_id": { "_in": "$CURRENT_USER.memberships.org.github_id" } }` |
| gp_orgs (new) | read | `{ "members": { "user": { "_eq": "$CURRENT_USER" } } }`. `adoption_token` is visible only to org admins: stripped for other roles by a read hook (permission fields can't differ per branch). |
| gp_orgs (new) | update | `{ "members": { "user": { "_eq": "$CURRENT_USER" }, "role": { "_eq": "admin" } } }`; fields: `adoption_token` (regenerate) |
| gp_org_members (new) | read | `{ "_or": [ { "user": { "_eq": "$CURRENT_USER" } }, { "org": { "members": { "user": { "_eq": "$CURRENT_USER" }, "role": { "_eq": "admin" } } } } ] }` — member sees own row, admin sees all |
| gp_org_members (new) | update | `{ "_or": [ { "user": { "_eq": "$CURRENT_USER" } }, { "org": { "members": { "user": { "_eq": "$CURRENT_USER" }, "role": { "_eq": "admin" } } } } ] }`; fields: `role, notification_preferences`. Per-field rules in a filter hook (like the gp_tokens create): `role` - only by an admin of that org, `notification_preferences` - only on own row. |

### Business logic updates:

**Users**
- User joins/leaves the org only through GitHub update -> sync.
- Header sub-menu has an "Act as organization" button+modal, which stores `activeOrg` in the FE store and in the
  `gp_active_account` cookie on `.globalping.io` (the account id, not the org id). The cookie is unsigned, so gp-api and
  gp-auth check the membership on every request and fall back to the personal account; it is per device, which is the point -
  the same user can act as the org on one machine and as themselves on another. The session cookie's signed `user_account_id`
  claim stays the personal account.
- Any admin can set the viewer/member/admin role for any other viewer/member/admin. Automatic GitHub sync only promotes a viewer/member to admin (if they are admins on GitHub), but never demotes back (because they might have been manually promoted previously).
- New 'viewer' role is read-only: a viewer sees org data but can't create tokens/approvals or spend org credits. Adopting probes into the org is admin-only.
- An org that hasn't approved our OAuth app is only visible through the public memberships list, which has no roles, so all of its members are synced as `member` and it has no admins at all (it stays usable for member actions). To get admins, the org has to approve the `globalping` app in its GitHub settings. The dash shows a hint about it when an org has no admins.
- Members who hide their membership in such an org are invisible to us entirely: they don't get the org, and an existing membership is removed on the next sync, so that everyone in the same position ends up the same (the sync never removes anything when GitHub is unreachable: a failed request aborts it). Making the membership public, or having the org approve the app, brings it back.

**Probes**
- A probe has a single owner: `account_id` (personal or org account).
- For adoption tokens, the owner is determined by the token (user's or org's adoption token). For adoption by IP or local server - by `activeOrg`.
- Only an admin can adopt a probe into the org: members don't see the org adoption token and can't adopt by IP or local server either.
- Admin, member, and viewer can view all org probes.
- Only admin can edit org probe metadata (city, name).
- Only admin can unassign the probe from the org. But nothing prevents it from being assigned back, e.g. if adopted by an org token, it will be assigned again automatically.
- If another user (not from org A) adopts a probe which belongs to org A, the probe is reassigned to the new owner.
- The `default_prefix` setting keeps its stored value and its automatic rename when it goes stale; what goes in phase 5 is the manual choice - the settings selector and the field's write permission, so it can not be set through the API either. An org account's global tag is the org name, switched on by `gp_orgs.public_probes`.
- The prefix select for probe tags is removed (phase 5): existing tags keep the prefix stored in the row, new and edited ones always get the owner's name (org name or `github_username`).

**Tokens**
- Admin or member can create an org token to consume org credits; viewer can't.
- Credits are consumed from the token's `account_id` (personal or org account).
- `account_id` defines who pays for the token; `user_created` defines the creator: each user sees/manages only their own tokens.
- Tokens are deleted when their user is deleted or leaves the org (org tokens die with the membership).

**Apps approvals**
- Admin or member can create an app approval + token to consume org credits; viewer can't.
- An approval is bound to a specific account: consent, the "already approved" check, listing, and revoke are all per account (the same app is approved separately for the personal account and for each org).
- If the user who created an app approval leaves the org - remove the approval and its tokens (same lifecycle as plain tokens).

**Credits**
- Probe credits are assigned based on the probe's `account_id`.
- The `org -> user` credits redirect is no longer needed; credits are assigned directly to the org.
- The `user -> org` credits redirect might be needed; it can be a new setting on the user page. Out of scope.

**Notifications**
- Org notifications go to the org admins only; members and viewers never receive them.
- Notification settings are per org and per user: each admin has their own notification config for each of their orgs, independent of their personal config.
- The types, the preferences shape, the defaults, and the validation are exactly the same as for the personal notifications.

### Dash UI updates

- New header menu item - "Act as organization", which opens a select org modal. The selected org is stored in a cookie and the FE store and shown in the header instead of the username.
- User doesn't have a "show all" option. So we don't have combined views.
- If an org is selected:
    - "Probes page" shows org probes in read-only/read-write state (based on role).
    - "Probe detail page" shows probe details in read-only/read-write state (based on role).
    - "Credits page" shows org credits stats (same for any role).
    - "Tokens page" shows the user's own tokens and approvals inside the org; nobody sees other members' tokens or approvals.
    - "Generate new token" creates a token inside the org (disabled for viewers).
    - "Adopt a probe" into the org is admin-only.
    - New "Organization" setting in "Settings". Only an admin can see, copy, and regenerate the org adoption token.
    - If the user is admin - a new "Organization" menu button and page, where the admin sees org info and all members, and can set member roles.
