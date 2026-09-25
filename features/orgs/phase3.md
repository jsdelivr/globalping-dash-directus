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
  (`account-migration.md` §7). The endpoints are therefore the only place that may move ownership, and they validate before they
  write.
- **Each transfer is atomic on its own.** Probes, tokens and credits move through three separate endpoints, so a partially moved
  account - probes in the org, credits still personal - is a normal resting state, not a failure. What must never be partial is a
  single transfer: the probes one also hands over the adoption token, the tokens one also moves the approvals.
- **A moved probe keeps its `userId`.** Only `account_id` changes. That is a deliberate exception to the phase 2 contract
  ("an org-owned row has `userId` NULL"): the readers already go through the account, and keeping the column means the old
  dashboard still shows the probe to the person who moved it until phase 5 drops the column.
- **Directus is deployed in this phase; gp-api, gp-auth and gp-dash are not.** Whatever the endpoints write has to be readable
  by the phase 2 readers exactly as they are deployed.
- No UI. The buttons are phase 4; this phase is the endpoints they call. Nothing is converted on anybody's behalf - the accounts
  we redirect today keep being redirected, and whether to unwind that is theirs to decide.

## 1. The redirect table, its seed, and the reader that already exists

Start here: everything later in the file either reads this table or writes through the code that reads it.

Two directions exist and they are not symmetric. Every redirect in place today runs **org -> user**: an org sponsors, and because
an org could not hold credits, the money was parked on a person by hand. Those rows are kept, they are the evidence 3.2 accepts,
and no new one is ever created. The only direction anything can create from this phase on is **user -> org**: a person routing
their own sponsorship to an org they belong to. Read every rule in this file with that asymmetry in mind - a rule written for one
direction silently does nothing for the other.

1.1 **Table.** `gp_credits_redirects (source_github_id, target_github_id)`, `UNIQUE(source_github_id)` - a github id sends its
credits to one place, which is what lets the POST overwrite instead of accumulating. No enabled flag: turning a redirect off is
deleting its row, which is one state fewer to carry and leaves no filter for a reader to forget - a missed `WHERE enabled` here
would route money to the wrong account. GitHub ids, not entity references: a redirect may point at somebody who exists in no
`directus_users` row at all, and `addCredits` plus the additions trigger already work in github ids.

1.2 **Seed migration.** Every entry of `SOURCE_ID_TO_TARGET_ID` becomes a row, and that is the whole plan for the accounts we
redirect today: their money keeps arriving exactly where it arrives now, and nothing is converted on their behalf. Unwinding is
theirs to choose - the phase 4 buttons let the person move the credits to the org, and 3.1 lets the org clear the redirect itself.
The map holds more entries than `plan.md` and `account-migration.md` describe; those files predate the later additions, and their
stale count goes with this change.

1.3 **`redirectGithubId` reads the table** instead of the constant, and the constant goes. No cache: it queries on every call.
The map is a handful of rows on an indexed lookup, the call sites are a webhook and a daily cron rather than a request path, and
any cache would be wrong for as long as its TTL - a donation arriving inside that window would be routed to the destination the
user just changed away from. Directus can run several workers, so invalidating on write would only reach the one that served the
write.

One hop, exactly as the constant behaved: look the id up, credit the target if a row exists, credit the id itself if not. A target
that happens to be the source of another row is not followed - that is a routing decision somebody else made about their own money,
not a continuation of this one.

Note what does **not** go through it: the probe credits cron writes `gp_credits_additions` directly with the probe owner's github id, and that is correct -
probe earnings belong to the owner, not to whoever the sponsorship is redirected to.

1.4 **Nothing reads the collection directly.** No `directus_permissions` row is created for it, so the only reader is the
`credits-redirect` GET of 3.1. A Directus filter cannot express the rule we want: the table holds github ids rather than a
relation to `gp_orgs`, so it cannot reach `members.role`, and the dynamic variables carry no role of their own. The closest
filter - source or target matching `$CURRENT_USER.external_identifier` or `$CURRENT_USER.memberships.org.github_id` - would hand
every member and every viewer of a sponsoring org the raw github id of the individual its money goes to, which is a counterparty
no row they can read today names. The endpoint sees the role and scopes by the active account, so it can be exact.

1.5 **The activity matcher stops keying on where the money went.** `handle-sponsor-activities.ts` asks "have we already credited
this activity" and answers by comparing an addition's `github_id` with `redirectGithubId(activity.sponsor.databaseId)`. Both sides
of that comparison become mutable in this phase: a user can create and delete a redirect through 3.1, and 3.7 rewrites
`github_id`. Either change makes an activity from the cron's 24-hour window look uncredited, and it is credited a second time.
Reachable on purpose - set a redirect, donate, delete the redirect, collect the same donation again personally - and by accident,
by transferring credits the day a donation arrives.

So `addCredits` records the sponsor's own github id in `meta.sponsorGithubId`, taken before the redirect is applied, and the
matcher compares that instead. Every writer already hands `addCredits` the raw sponsor id - the webhook, the cron's one-time and
tier-change paths, and `createRecurringSponsor` - so this is one line at the write side and one changed comparison at the match
side. The sponsor's identity never changes; where the money goes is routing, and routing is exactly what is now allowed to move.

This also closes the same hole in master, where the only way to change the map was a deploy: for one day afterwards, activities
whose additions were written under the old mapping matched nothing.

A migration stamps the field on every existing sponsorship addition so the matcher can require it and carry no fallback: an
addition sitting on a redirect target came from that target's source, anything else came from the id it was paid to. A target
that also sponsored on its own is the one case the rule gets wrong, and it is attributed to its source anyway - the row only
matters if it falls inside the cron's 24-hour window at deploy time, and nothing else reads the field.

1.6 **`gp_orgs.user_type`** (member | sponsor | special) ships with this schema change; what reads and writes it is step 4.

## 2. `extra_adoption_tokens` validation

Before anything writes the column, the rule that guards it has to exist - step 3 is the first writer.

2.1 **Update hook on `gp_orgs`.** The value is validated on every update: the shape of every entry, and the new array being a
**subset** of the old one - entries distinct, each one already stored. An admin may therefore remove entries and never append,
rewrite or repeat a token. One org per update: a single payload applied to several orgs at once has no meaning here, since the
array it has to be a subset of is a different one for each. Only update: `create` is left alone because the user policy does not
grant it and the only programmatic creator (`sync-orgs.ts`) never names the field.

It is a read-modify-write against the stored value, so two simultaneous removals both answer 200 and the later one wins, undoing
the other. The update response carries the stored array back through the read hook, which is what lets the caller notice.

2.2 **Reading it is admin-only**, exactly the way `adoption_token` already is: the field stays out of the `gp_orgs` read
permission, and the `gp-orgs` read hook puts it back on the rows of the orgs the caller administers. Default-deny, so a bug in the
hook hides the tokens instead of leaking them, and naming the field in a query is refused for everybody. Writing it is the other
half: `extra_adoption_tokens` joins `adoption_token` and `public_probes` in the `gp_orgs` update permission, which is what makes
the removal UI of phase 4 reachable, and 2.1 is what makes it safe.

## 3. The `transfer-data` extension

3.1 **Shape.** One Directus extension, five endpoints:

- `transfer probes`, `transfer tokens`, `transfer credits` - one per entity kind, each its own transaction. A user may hand over
  their probes and keep their credits; nothing forces the three to happen together or in any order.
- `credits-redirect` GET - the redirects where the active account's github id is the source or the target. It is the only
  reader of the table (1.4), and the org half of it is admin-only for the reason 1.4 gives: the counterparty of an org's redirect
  is a person no other row a member can read names. Each side comes back with its name - the user's
  `github_username` or the org's `name`, the bare id when neither table knows it - because the dash shows `john => acme-org` and
  can read no other user's row.
- `credits-redirect` POST - a person points their sponsorship at an org they belong to. Only that direction exists: an org
  receives a sponsorship, it never passes one on. It also ends every row that touches the caller, in either direction - sending
  their own money somewhere says they are nobody's stand-in any more. Pointing at an org that is itself redirected is allowed and
  needs no thought: the lookup is one hop (1.3).
- `credits-redirect` DELETE - removes one named row, `{ source, target }`, and either of the two sides may do it: the one giving
  its sponsorship away, and the one that has been receiving it. Naming the row is what lets an org end a single member's donation
  rather than all of them, and it is what makes the inherited `org -> user` rows removable - by the org that funds them, and by
  the person they route through.

The org is named by id; the caller is the session user, acting as the active account.

3.2 **Who may do what.** One matrix for all four operations:

| operation | admin | member | viewer |
|---|---|---|---|
| transfer probes | always | only while the org has no admin | never |
| transfer tokens | always | always | never |
| transfer credits | always | always | never |
| `credits-redirect` POST, own sponsorship | always | always | never |
| `credits-redirect` DELETE, a row this account is a side of | always | always for their own account, never for the org's | never |

The matrix is the whole rule; probes have no exception. A redirect is about where money goes, not about who may act for an org,
and reading one as permission would tie a probe capability to a row either side can delete. Somebody who has to hand probes over
to an org that already has an admin asks that admin instead.

The dash cannot pre-compute the probes row - a member may not read the org's memberships, so it cannot tell whether the org has an
admin - so that rejection has to come back as its own error, distinguishable from "you are a viewer" and from "no such org", and
worded for the person reading it.

The test is whether the operation hands the member something they could not already do for the org, not whether the org ends up
with more. Transferring tokens does give the org a credential that spends its credits - but a member may already create an org
token outright (`gp-tokens` accepts admin and member), so the transfer adds no capability. Credits and the redirect are pure
donations. Probes are different: the transfer hands the member's adoption token to the org (3.5), and from then on anything
reporting that token adopts into the org. A member cannot adopt into an org by any other route - adoption-code and local-adoption
both resolve the account with the default `roles = ['admin']` - so this one does grant something new, and it waits until the
member is the one running the org.

Viewers are excluded everywhere, and no redirect lifts that. The role is only ever viewer because an admin set it by hand - GitHub
yields admin or member - so it is an explicit decision and it wins.

3.3 **Promotion.** Any of the four operations promotes the caller to admin, but **only while the org still has no admin in our
DB**. Once it has one the operations stop granting anything, which is what closes the door behind the first claimant. Safe against
the members cron, which only ever promotes - a manually assigned admin is never demoted.

Two members transferring at the same moment both read "no admin" and both end up admins. Accepted: each of them was entitled to
claim the org at the moment they asked, so the outcome is one the rules already allow, just reached twice.

Known and accepted: an org that has not approved the `globalping` OAuth app is invisible to the memberships endpoint, so everybody
including its owners arrives through the public list with no role and is stored as a member (`github-api-client.ts:66`). Such an
org never gains an admin on its own, its claim window never closes, and the claim goes to whichever public member signs in first
rather than to the owner. The remedy is on GitHub - approving the app lets the sync assign the real admins - but nothing in the
product says so: the people who would need to hear it are the ones who never reach an admin-only screen.

3.4 **Probes.** `account_id` moves to the org's account; name, tags, custom location and settings stay. The only behavioural
change is the global tag: a probe that was targetable as `u-<owner's default_prefix>` through the owner's `public_probes` is now
covered by the org's own `public_probes`, under the org's name. The old tag is replaced outright - no `deprecated_prefix` entry and
no grace period, unlike the rename GitHub forces on a user. The difference is consent: the phase 4 screen names both tags before
the transfer runs, so the owner chooses it. Whoever targets the old tag from the outside does not see that screen, which is the
cost we accept.

Also accepted: nothing can send a transferred probe back. `gp_probes.account_id` is rejected on update for everybody, so an org
admin cannot disown what was handed to them. It stays tolerable because probes can only be transferred into an org that has no
admin, and the transfer makes the sender that admin - whoever has to live with the probes is the person who moved them.

3.5 **Adoption token, inside the probes transfer.** The probes cannot move alone - they keep reporting the user's adoption token
and the API would adopt them straight back. So the user's current token is appended to `gp_orgs.extra_adoption_tokens` as
`{ github_username, token }` and a fresh personal token is generated for the user. Consequences to keep in mind while
implementing: a user moves all of their probes at once, never one; the array holds one entry per member who migrated, so a second
migration never overwrites the first.

3.6 **Tokens and approvals, one endpoint.** `gp_tokens.account_id` moves, and every app token takes its `gp_apps_approvals` row
with it. The approval is not access - the token is - but it has to move for two reasons: `/applications/revoke` deletes from both
tables by the same `{ account_id, user_created }`, and an approval whose tokens left is invisible in the applications list while
its consent silently keeps skipping the consent screen. The collision is the thing to get right: the personal row becomes
`(user, app, org account)`, which the org may already have. Then the org's row wins and the personal one is dropped - an approval
only decides whether the consent screen is shown the next time the app asks, and a transfer is nobody answering that screen, so
the scopes the org consented to are not for it to widen. Nothing breaks either way: gp-auth reads an approval only in
`saveAuthorizationCode`, never when a token is used. `user_created` never changes - moving the row changes which account is
billed, not who consented.

3.7 **Credits.** The balance and the deductions move to the org account, and the additions history moves with them
(`gp_credits_additions.github_id` becomes the org's), which carries the sponsor bonus along - `getUserBonus` sums the last twelve
months by `github_id`, so nothing has to know about redirects. Two traps: `gp_credits` is `UNIQUE(account_id)` and
`gp_credits_deductions` is `UNIQUE(account_id, date)`, so a target row may already exist and the amounts have to be summed rather
than re-pointed; and `after_gp_credits_update` turns any decrease of `gp_credits.amount` into a deduction, so the personal row
must be **deleted, never zeroed**, or the user gets a phantom "spent today".

Moving `github_id` is what carries the sponsor bonus across: `getUserBonus` sums the last twelve months by github id, so the org
inherits the percentage the donations earned, and the giver's timeline loses them because it reads additions by github id too
(`credits-timeline/src/index.ts:96`). It is safe to rewrite only because of 1.5 - the cron no longer recognises an addition by the
id it was filed under.

Redirects are left alone. Handing over the credits that have arrived and routing the ones that will are two decisions, and the
`org -> user` row is the org's, not the caller's: clearing it reroutes the org's money, which is why it has its own endpoint and
its own confirmation (3.1). An org that still redirects to someone who just gave it their credits is a state the org ends, not a
side effect of their button.

3.8 **Failure.** Each endpoint is one transaction, so a failed transfer leaves its own entity kind untouched and says nothing
about the other two. The adoption token is the only part with an effect outside the database - the API's token map refreshes
within a minute - and it is written inside the probes transaction like the rest, so a rollback leaves the old token in place and
the probes where they were. The API's own caches lag a little either way: a transferred token bills the old account for up to two
minutes (`auth.ts:14`) and a fresh admin is seen as a member for up to one (`accounts.ts:7`). Both are acceptable.

## 4. The tier follows the account

4.1 **The problem this phase creates.** Today the measurement tier comes from the requesting person: `auth.ts` joins `user_type`
off `directus_users`, gp-api encodes it into the measurement id and the offloader stores the result in `measurement_<tier>`. It
grants nothing - no limits, no credits - it only picks the table, which is why nobody has had to care. It becomes wrong here:
once the credits and the redirect move to the org, the org is the sponsor while `user_type` still sits on its members, so a member
who is not a sponsor writes org measurements into `measurement_member`, and a sponsor who left the org keeps writing them into
`measurement_sponsor`.

4.2 **Fix.** Take the tier from the account owner: `COALESCE(org.user_type, user.user_type)` - the same shape already used for
`default_prefix` and `adoption_token`, over the column added in 1.6. Both ways in read it: the token path in `auth.ts`, and the
dashboard's session path through `getAccountRole`, which resolves the active account and now carries its tier with it. Leaving the
second one out would have fixed exactly the case 4.1 describes for API tokens and left the dashboard doing the old thing.

This half is gp-api, so it belongs to phase 2 and deploys with it, before phase 3. The contract above is unchanged: phase 3 still
deploys Directus alone. The API keeps its own copy of the dashboard schema for tests
(`migrations/dashboard/create-tables.js.sql`), so the column is added there too.

A `special` account that acts for an org gets the org's tier, because the tier of a measurement is the tier of whoever pays for
it. `special` still outranks everything on the account that holds it.

4.3 **Who sets it.** The sponsors cron and the GitHub sponsorship webhook, which match sponsors by `external_identifier` today
and now match an org by `github_id` as well, through one helper. The one-time and tier-changed paths keep setting no tier, as
before - a one-time payment is undone by the same cron dropping the sponsor.

The cron reconciles the tier of every sponsor it already knows, not only of the ones appearing for the first time. Otherwise an
org that sponsors today would stay a `member` forever: nothing has ever written the column, and an org row is created by the
GitHub sync whenever its first member signs in, which can be long after the sponsorship started. Reconciling also means no
backfill migration is needed - the next hourly run fixes everything.

## 5. The member names for the admins of an org

The members list of phase 4 shows each member's name, and a user can read no `directus_users` row but their own - the only read
rule is `id _eq $CURRENT_USER` (`20230425GP-create-user-role.js`) - so it would render bare uuids. It ships here so that phase 4
is a dash deploy only. The extra adoption tokens do not need it: each entry carries its own `github_username`.

5.1 **A read hook on `gp_org_members`**, not a permission: `gp_org_members.items.read` attaches `github_username` to every row of
the payload, read from `directus_users` by the ids those rows carry. It is the shape `gp-orgs` already uses for `adoption_token`,
and the scoping comes with it - the read permission has already chosen the rows, your own plus every row of an org you administer,
so a name only ever rides along with a membership the caller may read anyway and the hook repeats no role check.

5.2 **Not a second read rule on `directus_users`**, which was the first plan and leaks. Directus validates `filter`, `sort`,
`groupBy`, `aggregate` and `alias` against the union of the field lists of every rule matching the collection, not against the
fields of the rule that let a given row through. A second rule exposing `github_username` therefore makes every field of the first
rule nameable against the rows of the second: `filter[adoption_token][_starts_with]` walks a co-member's adoption token character
by character, and `groupBy=github_username&aggregate[max]=email` hands out their address in one request. A permission rule that
widens the rows has to be assumed to widen the fields as well.

5.3 **The field can not be named in a query**, since it is no column of `gp_org_members`: `fields`, `sort`, `filter`, `groupBy`,
`aggregate` and `alias` all answer 403 for it, exactly as for the org's `adoption_token`, and it arrives unasked with every other
selection. Directus also resolves relational data without emitting the read filter, so `members` under `gp_orgs` and `memberships`
under `readMe` come back without it: the members list is its own `/items/gp_org_members` request, and the name is taken off the
rows rather than asked for.

## 6. Tests

6.1 **Unit**, per extension: the authorization matrix (3.2) with every cell, the promotion window (3.3), the subset validation
(2.1), the names the redirect list falls back to (3.1), the two conditions around the adoption token (3.5) - a probe has to
have moved, and the entry has to carry a username - and the name attached to a membership read (5.1), which the rows of a payload
get while an internal read and a payload without ids are left alone. Not the credits and approval moves: those are unique keys, a trigger and what
MariaDB allows in a subquery, so a unit test there asserts the implementation's own statements back at it.

6.2 **e2e over REST**: each transfer alone and all three in sequence; a member refused the probes transfer in an org that has an
admin; the first member of an admin-less org becoming its admin; a second member transferring into the same org (the token array
grows, the first entry survives); a transfer into an org that already holds an approval of the same app (the org's row stands); a redirect
created, overwritten, refused by the side receiving it and deleted; a rollback on a forced failure leaving nothing moved; an org admin reading the name of every
member of the org while a member and a viewer read only their own, the name refused in every part of a query that names a field,
and nothing of a co-member reachable through `/users` - not by a filter on the adoption token and not by an aggregate over the
emails.

## Deploy

Directus: `schema:apply` for `gp_credits_redirects` and `gp_orgs.user_type`, then the migrations (redirect seed, sponsor id
backfill, the `gp_orgs` permission), then restart. The member names (5) are extension code only, so they ship with that restart.
gp-api is redeployed too, for the account tier of 4.2. The dash is not, so the endpoints have to be correct against the phase 2
readers as they already run in prod.
