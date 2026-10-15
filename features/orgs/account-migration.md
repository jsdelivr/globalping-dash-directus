# Account migration

Moving a user's own account into an org - the "migrate to organization" button. The back end is one endpoint per entity kind
(probes, tokens, credits), each its own transaction, so a user can take one part over without the rest. The UI is phase 4.

**Ships after phase 2, not with phase 1.** Before the readers move to `account_id` the transfer is either a no-op or harmful:
the balance leaves `gp_credits.user_id`, where `credits-master` still looks for it (`credits-master.ts:65,98,117`), so the
user's credits vanish; probes keep their `userId` and stay personal for the API (`adopted-probes.ts:376`); token ownership is
`user_created` and does not move at all (`auth.ts:134`). The one piece that must exist earlier is the
`gp_orgs.extra_adoption_tokens` column - gp-api reads it in phase 2 and Directus is not deployed in between - so it ships with
the phase 1 snapshot, unused until then.

## 1. Who may migrate

A transfer of any kind is a privilege escalation risk: whoever migrates into an org with no admin ends up its admin (2), so an
ordinary GitHub member of a big org must not be able to walk in through it. The rule:

Admins may do everything, always. Viewers may do nothing, ever - that role exists only because an admin set it by hand, since
GitHub yields admin or member. Members may transfer tokens and credits and point a credits redirect at the org at any time; they
may transfer probes only while the org has no admin. The line is whether the operation hands them something they could not already
do for the org: an org token they may create outright anyway, so transferring one adds nothing, while the adoption token that goes
with the probes lets anything reporting it adopt into the org - and adopting into an org is otherwise admin-only.

Any of those four operations makes the caller an admin while the org has no admin yet, so in practice the first member to touch an
unclaimed org takes it over. That is intended. Two consequences are accepted with it: an org that has not approved our OAuth app
has no visible roles at all, so its real owners arrive as plain members and the claim can go to any public member of it instead;
and whoever claims an org can demote the admins who arrive later, until the sync promotes them back.

## 2. Membership

The first member to move anything into an org that has no admin becomes its admin, regardless of their GitHub role; in an org
that already has one, the membership stays as it is. Safe against the sync, which only ever promotes: a manually assigned admin is
never demoted.

## 3. Probes

`account_id` moves from the user's account to the org's. Everything else stays as it is - name, tags, custom location, settings -
and `userId` is kept until phase 5. Tags keep their names after the move, in phase 5
too - the prefix stored in the row stays authoritative, and only tags created after the move carry the org's name. The one thing the
move does change is the global tag: a probe that was targetable as `u-<owner's default_prefix>` through its owner's `public_probes`
is now covered by the org's own `public_probes`, under the org's name. The old tag is replaced, not deprecated - no
`deprecated_prefix`, no grace period. That is the one place where a public tag is allowed to disappear, and it is allowed because
the migration is a deliberate click: the phase 4 screen names the old tag and the new one before anything is written. The rename
that GitHub forces on a user keeps its grace period precisely because nobody clicked anything there.

## 4. Adoption token

A probe can not simply be moved: it keeps reporting the adoption token of its user, and the API adopts it right back. So the
token moves too - the user's current adoption token is appended to the `extra_adoption_tokens` json array on `gp_orgs` as
`{ github_username, token }`, and a fresh personal token is generated for the user. Consequences:

- a user moves all of their probes at once, never a single one: the token is what moves, and it is per user;
- the array holds one entry per member who migrated, so a second migration never overwrites the first;
- any admin can edit the array - in practice, remove entries. The update hook validates the value: the shape of every entry, and
  that the new array is a subset of the old one, so an admin can never append or rewrite a token. It is a read-modify-write, and
  the losing side of two simultaneous edits simply repeats it;
- reading it is admin-only, like `adoption_token`: the field stays out of the `gp_orgs` read permission, and the `gp-orgs` read
  hook adds it for the admins. A field in the permission can be named in a filter by every member who reads the row, so even with
  the output stripped it would hand every member the tokens of every other member, one character at a time;
- the array is listed in the org settings with the username each token came from (phase 4). Without that list the tokens would be
  permanent and invisible: a member who migrated and then left could keep adopting probes into the org forever.

Rejected alternative: keep the tokens as they are and instead cancel the re-adoption back to the user when the probe already
belongs to one of their orgs. It needs the API to track whose token a probe reported, users to hold several tokens, and it still
leaves no way to revoke the access.

## 5. Tokens

`gp_tokens.account_id` moves to the org account, and every app token takes its `gp_apps_approvals` row along. An approval is not
access - the token is - it is gp-auth's memory of a consent and of the scopes it covers, written when the user approves the
consent screen and read back to skip it next time (`globalping-auth/src/oauth/model.ts:163,190`). It still has to move with the
tokens for two reasons:

- revoking assumes the pair is on one account: `/applications/revoke` deletes from both tables by the same
  `{ account_id, user_created }`, so a split leaves the org's revoke removing the token while the consent lives on in the
  personal account;
- an approval whose tokens left is invisible. The applications list is built from `gp_tokens`, not from approvals, so the app
  disappears from the personal account's UI while its consent silently keeps skipping the consent screen there.

Moving it changes the account a consent is billed to, never who consented - `user_created` stays the same person.
`gp_apps_approvals` is `UNIQUE(user_created, app, account_id)`, so the two rows coexist happily *before* the transfer and collide
during it: the personal row becomes `(user, app, org account)`, which the org may already have. The org's row wins and the
personal one is dropped: a transfer is nobody answering the consent screen, so the scopes the org consented to are not for it to
widen (`phase3.md` 3.6). `gp_tokens` needs no such care, its only unique key is `value`.

## 6. Credits

The redirects move out of the code into a `gp_credits_redirects` table (`source_github_id`, `target_github_id`), and
`redirectGithubId` reads it instead of `SOURCE_ID_TO_TARGET_ID`. Github ids, not entity references: a redirect may point at
someone who does not exist in our DB at all - one of the current targets is in no `directus_users` row - `addCredits` and
the additions trigger already work in github ids. Nothing reads the table through a permission: the `credits-redirect` endpoint
is its only reader (`phase3.md` 3.1). A user sees the redirects where the active account's github id is the source **or** the
target - both, because every redirect that exists today runs org -> user, and a lookup keyed on one direction would show them to
nobody. The only direction that can be created from now on is user -> org, pointing a person's own sponsorship at an org they
belong to; the org -> user rows stay as they are until either side removes one, or their user points their own sponsorship
somewhere (`phase3.md` 3.1).
Then:

- no redirect is created: the credits move once, while a redirect routes what arrives later, so pointing a sponsorship at an org
  is its own endpoint (`phase3.md` 3.1) and its own decision;
- the history moves: `gp_credits_additions.github_id` becomes the org's, which carries the sponsor bonus with it - `getUserBonus`
  sums the last 12 months by `github_id`, so nothing has to know about redirects;
- the balance and the deductions move to the org account. Two traps: `gp_credits` is `UNIQUE(account_id)` and
  `gp_credits_deductions` is `UNIQUE(account_id, date)`, so a target row may already exist and the amounts have to be summed
  rather than re-pointed; and `after_gp_credits_update` turns any decrease of `gp_credits.amount` into a deduction, so the
  personal row must be deleted, never zeroed, or the user gets a phantom "spent today".

## 7. What happens later

Losing the membership revokes almost nothing by itself: the probes stay with the org, the adoption token stays in the array and
the redirect stays in place, for an admin to undo when they want to. The exception is section 5 -
`gp_org_members_clean_up_tokens` (`20260813GP`) deletes that member's org tokens and approvals on the way out, so migrated tokens
do not survive the departure. Nothing is ever migrated back to the user.
