# Phase 3: account migration

Process: one step at a time. TDD where applicable (per-extension mocha), verify validity on the dev instance, verify performance
on the dev instance, review. Then user reviews, commits and confirms next start of work with next step.

Full design in `account-migration.md` - this file is the implementation order and the decisions that have to be made while
writing it, not a restatement of the design.

## What phases 1-2 already give us

- `gp_accounts (id, user, org)`, an account per user and per org, created by triggers.
- `account_id` on `gp_probes`, `gp_tokens`, `gp_credits`, `gp_credits_deductions`, `gp_apps_approvals`, backfilled and dual-written.
- Every reader resolves the owner through the account: gp-api bills `gp_credits.account_id`, tags probes by
  `COALESCE(org.name, user.default_prefix)`, adopts by the org's `adoption_token` and by the entries of `extra_adoption_tokens`.
- `gp_orgs.extra_adoption_tokens` exists and is empty - phase 1 shipped the column, nothing writes it yet. This phase is what
  writes it.
- `gp_apps_approvals` is `UNIQUE(user_created, app, account_id)`, so the same person can hold a personal and an org approval of
  the same app side by side.

## Contract for this phase

- **The transfer is irreversible.** Nothing is ever migrated back, and losing the membership later revokes almost nothing
  (`account-migration.md` §7). The endpoint is therefore the only place that may move ownership, and it validates before it writes.
- **Each transfer is atomic on its own.** Probes, tokens and credits move through three separate endpoints, so a partially moved
  account - probes in the org, credits still personal - is a normal resting state, not a failure. What must never be partial is a
  single transfer: the probes one also hands over the adoption token, the tokens one also moves the approvals.
- **A moved probe keeps its `userId`.** Only `account_id` changes. That is a deliberate exception to the phase 2 contract
  ("an org-owned row has `userId` NULL"): the readers already go through the account, and keeping the column means the old
  dashboard still shows the probe to the person who moved it until phase 5 drops the column.
- **Directus is deployed in this phase; gp-api, gp-auth and gp-dash are not.** Whatever the endpoint writes has to be readable
  by the phase 2 readers exactly as they are deployed.
- No UI. The button is phase 4; this phase is the endpoint it calls plus the one-off conversion of the accounts that are
  redirected today.

## 1. The `transfer-data` extension

1.1 **Shape.** One Directus extension, five endpoints:

- `transfer probes`, `transfer tokens`, `transfer credits` - one per entity kind, each its own transaction. A user may hand over
  their probes and keep their credits; nothing forces the three to happen together or in any order.
- `credits-redirect` GET - the redirects where the active account's github id is the source or the target.
- `credits-redirect` POST - point the caller's own sponsorship at an org, replacing whatever redirect they had.

The org is named by id; the caller is the session user, acting as the active account.

1.2 **Who may do what.** One matrix for all four operations:

| operation | admin | member | viewer |
|---|---|---|---|
| transfer probes | always | only while the org has no admin | never |
| transfer tokens | always | always | never |
| transfer credits | always | always | never |
| `credits-redirect` POST | always | always | never |

The dash cannot pre-compute the probes row - a member may not read the org's memberships, so it cannot tell whether the org has an
admin - so that rejection has to come back as its own error, distinguishable from "you are a viewer" and from "no such org", and
worded for the person reading it.

The test is whether the operation hands the member something they could not already do for the org, not whether the org ends up
with more.

Transferring tokens does give the org a credential that spends its credits - but a member may already create an org token
outright (`gp-tokens` accepts admin and member), so the transfer adds no capability. Credits and the redirect are pure donations.

Probes are different: the transfer hands the member's adoption token to the org (1.5), and from then on anything reporting that
token adopts into the org. A member cannot adopt into an org by any other route - adoption-code and local-adoption both resolve
the account with the default `roles = ['admin']` - so this one does grant something new, and it waits until the member is the one
running the org.

Viewers are excluded everywhere. The role is only ever viewer because an admin set it by hand - GitHub yields admin or member -
so it is an explicit decision and nothing overrides it.

1.3 **Promotion.** Any of the four operations - transfer probes, transfer tokens, transfer credits, or point a credits redirect at
the org - promotes the caller to admin, but **only while the org still has no admin in our DB**. Once it has one the operations
stop granting anything, which is what closes the door behind the first claimant. Safe against the members cron, which only ever
promotes - a manually assigned admin is never demoted.

The check and the promotion belong in the same transaction, with the org row locked: two members reading "no admin" at once would
otherwise both become one, and the door would not close behind either.

Known and accepted: an org that has not approved the `globalping` OAuth app is invisible to the memberships endpoint, so everybody
including its owners arrives through the public list with no role and is stored as a member (`github-api-client.ts:66`). Such an org
never gains an admin on its own, its claim window never closes, and the claim goes to whichever public member signs in first rather
than to the owner. The remedy is on GitHub - approving the app lets the sync assign the real admins - but nothing in the product
says so: the people who would need to hear it are the ones who never reach an admin-only screen.

1.4 **Probes.** `account_id` moves to the org's account; name, tags, custom location and settings stay. The only behavioural
change is the global tag: a probe that was targetable as `u-<owner's default_prefix>` through the owner's `public_probes` is now
covered by the org's own `public_probes`, under the org's name. The old tag is replaced outright - no `deprecated_prefix` entry and
no grace period, unlike the rename GitHub forces on a user. The difference is consent: here the phase 4 screen names both tags
before the transfer runs, so the owner chooses it. Whoever targets the old tag from the outside does not see that screen, which is
the cost we accept for keeping the transfer a single reversible-by-nobody operation.

1.5 **Adoption token, inside the probes transfer.** The probes cannot move alone - they keep reporting the user's adoption token and the API would adopt them
straight back. So the user's current token is appended to `gp_orgs.extra_adoption_tokens` as `{ github_username, token }` and a
fresh personal token is generated for the user. Consequences to keep in mind while implementing: a user moves all of their probes
at once, never one; the array holds one entry per member who migrated, so a second migration never overwrites the first.

1.6 **Tokens and approvals, one endpoint.** `gp_tokens.account_id` moves, and every app token takes its `gp_apps_approvals` row with it.
The approval is not access - the token is - but it has to move for two reasons: `/applications/revoke` deletes from both tables by
the same `{ account_id, user_created }`, and an approval whose tokens left is invisible in the applications list while its consent
silently keeps skipping the consent screen. The collision is the thing to get right: the personal row becomes
`(user, app, org account)`, which the org may already have. Merge them, taking the union of the scopes, the way gp-auth itself
unions them (`model.ts:198`). `user_created` never changes - moving the row changes which account is billed, not who consented.

1.7 **Credits.** The balance and the deductions move to the org account, and the additions history moves with them
(`gp_credits_additions.github_id` becomes the org's), which carries the sponsor bonus along - `getUserBonus` sums the last twelve
months by `github_id`, so nothing has to know about redirects. Two traps: `gp_credits` is `UNIQUE(account_id)` and
`gp_credits_deductions` is `UNIQUE(account_id, date)`, so a target row may already exist and the amounts have to be summed rather
than re-pointed; and `after_gp_credits_update` turns any decrease of `gp_credits.amount` into a deduction, so the personal row
must be **deleted, never zeroed**, or the user gets a phantom "spent today".

1.8 **Failure.** Each endpoint is one transaction, so a failed transfer leaves its own entity kind untouched and says nothing
about the other two. The adoption token is the only part with an effect outside the database - the API's token map refreshes within
a minute - and it is written inside the probes transaction like the rest, so a rollback leaves the old token in place and the probes
where they were.

## 2. Redirects move into the database

Two directions exist and they are not symmetric. Every redirect in place today runs **org -> user**: an org sponsors, and because
an org could not hold credits, the money was parked on a person by hand. Those rows are kept, they are the evidence §1.2 accepts,
and no new one is ever created. The only direction anything can create from this phase on is **user -> org**: a person routing
their own sponsorship to an org they belong to. Read every rule below with that asymmetry in mind - a rule written for one
direction silently does nothing for the other.

2.1 **Table.** `gp_credits_redirects (source_github_id, target_github_id)`, `UNIQUE(source_github_id)` - a github id sends its
credits to one place, which is what lets the POST overwrite instead of accumulating. No enabled flag: turning a redirect off is
deleting its row, which is one state fewer to carry and leaves no filter for a reader to forget - a missed `WHERE enabled` here
would route money to the wrong account. GitHub ids, not entity references: a redirect
may point at somebody who exists in no `directus_users` row at all, and `addCredits` plus the additions trigger already work in
github ids.

2.2 **`redirectGithubId` reads the table** instead of `SOURCE_ID_TO_TARGET_ID`. It is called on every credits write and on every
activity the sponsors cron matches (`handle-sponsor-activities.ts:143`), so it needs a cache with a short TTL rather than a query
per call - the map is a handful of rows and changes by hand.

2.3 **`credits-redirect` GET.** Returns the redirects where the active account's github id is the source **or** the target. Both
directions matter and an earlier draft had only one: every redirect that exists today runs org -> user, so a rule keyed on "source,
or an org I administer as target" would show them to nobody - not to the user receiving the credits, not to the admin of the org
funding them.

2.4 **Seed.** `SOURCE_ID_TO_TARGET_ID` holds more entries than `plan.md` and `account-migration.md` describe - those files predate
the later additions. Seed every entry so nothing changes for prod on deploy, and drop the stale count from the older files.

2.4 **`credits-redirect` POST.** Creates a redirect from the caller's own github id to the named org, replacing their existing one
if there is any; `orgId: null` deletes it and the credits go back to the caller's own account. The org must be one the caller
belongs to as an admin or a member - a viewer may not point credits at an org any more than they may transfer into it - user -> org is the only direction that can ever be created, and only towards an org the user can already act for. The
`org -> user` rows that exist today stay as they are and are expected to disappear over time as their owners transfer; nothing
creates a new one. Note the POST can never manufacture the evidence §1.2 accepts, which is a redirect in the opposite direction.

2.5 **The transfers maintain them too.** If a redirect org -> user exists and that user transfers their credits anywhere, that row
is deleted. The seed cannot bring it back: it is a knex migration, so it runs once per database, and a database fresh enough to run
it again has no migrated accounts either. A user -> org redirect is created; from this phase on that is the only kind that can be created.

## 3. `extra_adoption_tokens` validation

3.1 **Update hook on `gp_orgs`.** The value is validated on every write: the shape of every entry, and the new array being a
**subset** of the old one. An admin may therefore remove entries and never append or rewrite a token. It is a read-modify-write,
and the losing side of two simultaneous edits simply repeats it.

3.2 **Reading it is admin-only**, like `adoption_token`. That takes both halves: the field is added to the `gp_orgs` read
permission *and* the `gp-orgs` read hook strips it for everyone else. Adding it to the permission alone would hand every member
the tokens of every other member.

## 4. The tier follows the account

4.1 **The problem this phase creates.** Today the measurement tier comes from the requesting person: `auth.ts` joins `user_type`
off `directus_users`, gp-api encodes it into the measurement id and the offloader stores the result in `measurement_<tier>`. It
grants nothing - no limits, no credits - it only picks the table, which is why nobody has had to care. It becomes wrong here:
once the credits and the redirect move to the org, the org is the sponsor while `user_type` still sits on its members, so a member
who is not a sponsor writes org measurements into `measurement_member`, and a sponsor who left the org keeps writing them into
`measurement_sponsor`.

4.2 **Fix.** Add `gp_orgs.user_type` (member | sponsor | special) and take the tier from the account owner:
`COALESCE(org.user_type, user.user_type)` - the same shape already used for `default_prefix` and `adoption_token`.

4.3 **Who sets it.** The sponsors cron, which matches sponsors by `external_identifier` today and can match an org by
`github_id`.

## 5. One-off conversion of the accounts that are redirected today

5.1 **Inventory.** Eight redirects. Five of the sources are GitHub organizations by their sponsor login (`railwayapp`,
`iplocate`, `arexico`, `fbw-networks`, `opportify`); none of the eight sources has a `directus_users` row, and seven of the eight
targets do. So the shape is what the design assumes: an org sponsors, the credits are parked on a person.

5.2 **The one that is not.** Target `219827779` (source `21207279`) exists in no `directus_users` row - the account was deleted.
Its additions have to be re-pointed to the source (`219827779` -> `21207279`) **before** the transfer, or the history lands
nowhere.

5.3 **Procedure.** Reuse the endpoint's code rather than repeating it: create the org if the sync has not, re-point 5.2, run the
transfer, disable the old redirect.

5.4 **How much to automate.** Whatever the owners do themselves through the phase 4 button needs no conversion at all. Decide the
split once the button exists - the safe default is to convert nothing automatically and hand the list to whoever runs the deploy.

## 6. Tests

6.1 **Unit**, per extension: the authorization rule (1.2) with every branch, the approval merge (1.6), the credits traps (1.7),
the subset validation (3.1).

6.2 **e2e over REST**: a full migration of all three entity kinds and of each one alone; a member who may not migrate; a second
member migrating into the same org (the token array grows, the first entry survives); a migration into an org that already holds
an approval of the same app (scopes union); a rollback on a forced failure leaving nothing moved.

## Deploy

One Directus deploy: `schema:apply` for `gp_credits_redirects` and `gp_orgs.user_type`, then the migrations (redirect seed,
permissions), then restart. No other service is redeployed, so the endpoint has to be correct against the phase 2 readers as they
already run in prod.
