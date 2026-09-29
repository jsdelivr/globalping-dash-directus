# Account migration

Moving a user's own account into an org - the "migrate to organization" button. The back end is one endpoint and one
transaction; the caller says which entities to move (probes, tokens, credits), so a user can take one part over without the
rest. The UI is phase 4.

**Ships after phase 2, not with phase 1.** Before the readers move to `account_id` the transfer is either a no-op or harmful:
the balance leaves `gp_credits.user_id`, where `credits-master` still looks for it (`credits-master.ts:65,98,117`), so the
user's credits vanish; probes keep their `userId` and stay personal for the API (`adopted-probes.ts:376`); token ownership is
`user_created` and does not move at all (`auth.ts:134`). The one piece that must exist earlier is the
`gp_orgs.extra_adoption_tokens` column - gp-api reads it in phase 2 and Directus is not deployed in between - so it ships with
the phase 1 snapshot, unused until then.

## 1. Who may migrate

A transfer of any kind is a privilege escalation risk: whoever migrates ends up an admin of the target org (2), so an ordinary
GitHub member of a big org must not be able to walk in through it. The rule:

- an admin of the target org may always migrate;
- a member may migrate only if the org has no admins in the DB yet, or if a credits redirect org -> user already exists (the six
  sponsor accounts - the redirect is our proof that the person is the org);
- the first such transfer makes them an admin, which closes the door behind them: from then on the org has an admin and every
  other member falls back to the first rule.

## 2. Membership

The migrating user becomes an admin of the org regardless of their GitHub role, creating the membership if it is missing. Safe
against the sync, which only ever promotes: a manually assigned admin is never demoted.

## 3. Probes

`account_id` moves from the user's account to the org's. Everything else stays as it is - name, tags, custom location, settings -
and `userId` is kept until phase 5, exactly like the one-off migration of the six. Tags keep their names after the move, in phase 5
too - the prefix stored in the row stays authoritative, and only tags created after the move carry the org's name. The one thing the
move does change is the global tag: a probe that was targetable as `u-<owner's default_prefix>` through its owner's `public_probes`
is now covered by the org's own `public_probes`, under the org's name.

## 4. Adoption token

A probe can not simply be moved: it keeps reporting the adoption token of its user, and the API adopts it right back. So the
token moves too - the user's current adoption token is appended to the `extra_adoption_tokens` json array on `gp_orgs` as
`{ github_username, token }`, and a fresh personal token is generated for the user. Consequences:

- a user moves all of their probes at once, never a single one: the token is what moves, and it is per user;
- the array holds one entry per member who migrated, so a second migration never overwrites the first;
- any admin can edit the array - in practice, remove entries. The update hook validates the value: the shape of every entry, and
  that the new array is a subset of the old one, so an admin can never append or rewrite a token. It is a read-modify-write, and
  the losing side of two simultaneous edits simply repeats it;
- reading it is admin-only, like `adoption_token`: the `gp_orgs` read permission has to gain the field *and* the `gp-orgs` read
  hook has to strip it for everyone else. Adding it to the permission alone would hand every member the tokens of every other
  member;
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
during it: the personal row becomes `(user, app, org account)`, which the org may already have. Merge them, taking the union of
the scopes - the personal row may hold the wider set - the way gp-auth itself unions them (`model.ts:198`). `gp_tokens` needs no
such care, its only unique key is `value`.

## 6. Credits

The redirects move out of the code into a `gp_credits_redirects` table (`source_github_id`, `target_github_id`, `enabled`), and
`redirectGithubId` reads it instead of `SOURCE_ID_TO_TARGET_ID`. Github ids, not entity references: a redirect may point at
someone who does not exist in our DB at all (`219827779`, the vidalytics target, is in no `directus_users` row), `addCredits` and
the additions trigger already work in github ids, and the read rules can be written with `$CURRENT_USER.external_identifier` and
`$CURRENT_USER.memberships.org.github_id`, as `20260816GP` already does. A user sees the redirects where they are the source, or
where an org they administer is the target. Then:

- if a redirect org -> user exists and the user migrates their credits anywhere, that redirect is disabled;
- a user -> org redirect is created. That is the only kind of redirect that can be created from now on;
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
