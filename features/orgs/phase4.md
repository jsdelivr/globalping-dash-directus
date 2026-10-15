# Phase 4: gp-dash org UI

Process: one screen at a time, each behind the endpoint that already enforces the rule. Per step: change, component tests,
verify on the dev instance (dash 13010 against Directus 18055 with phases 1-3 applied), review. Then user reviews, commits and
confirms next start of work with next step.

## What phases 1-3 already give us

- `directus_users.selected_orgs` (phase 1, written by nothing yet - this phase is what writes it) and `gp_orgs.public_probes`.
- gp-api reads the `gp_active_account` cookie on `.globalping.io` and authorizes it on every request: the account must be the
  user's own or an org where the role is admin or member, anything else silently falls back to the personal account (phase 2).
- Every Directus endpoint takes `accountId`; `userId` survives only as a `// PHASE5: remove` shim for the old dashboard.
- `/oauth/token/introspect` returns the account a token acts for (phase 2).
- The `transfer-data` extension, `gp_credits_redirects` and the validated `gp_orgs.extra_adoption_tokens` (phase 3).
- The `github_username` of each member, attached by a Directus hook to the rows of a top level `gp_org_members` read that
  includes `id` (phase 3), which is what the members list renders; a role is changed by the membership `id`. It can not be named
  in `fields` and it does not survive a nested read, so the list is its own request and the name is taken off the rows.

## Contract for this phase

- **Dash only.** Directus, gp-api and gp-auth are not deployed: every rule and permission these screens rely on shipped in phase 3.
- **The UI never grants anything.** Every role gate here mirrors a rule the endpoint already enforces; hiding a control is a
  courtesy, not a security boundary. What the UI hides is what it can decide from the caller's own role, which it knows: a viewer
  is never offered an action a viewer may not take. What depends on org state the caller cannot read - above all whether the org
  already has an admin, which a member cannot see - is left to the endpoint and surfaced as an explicit error. Pre-hiding those
  would mean building a channel that discloses the org's roster to every member just to grey out a button.
- **Irreversible actions are spelled out before they run.** Two of them live in this phase: the transfers (7) and demoting a
  member to viewer (6.3).
- **The account switch is per device by construction.** It lives in a browser cookie, nothing is stored server-side, so a laptop
  can act as the org while the phone stays personal.

## 1. Acting as an organization

1.1 **Org store.** Memberships and roles load on login; the user's own account id comes from the `readMe` expansion Directus
already returns (`account` alias, phase 1). Everything downstream filters by an account id, never by a user id.

1.2 **Active account.** `activeOrg` in the store plus the `gp_active_account` cookie on `.globalping.io`, which is what gp-api
reads. The dash may write anything into it - the API re-authorizes it on every request - so the UI must treat a silent fallback
to the personal account as a possible outcome and not assume its own state is authoritative.

1.3 **gp-auth does not read the cookie.** The account for an approval is picked on the consent screen (5.2), never inherited from
browser state. Keep the two concepts separate in the store or the consent screen will silently approve for whatever the header
last switched to.

## 2. The "Act as organization" menu

2.1 **Where it lives.** An "Act as organization" entry in the user menu, between Settings and Sign out. It opens a submenu with the
personal account and the user's `selected_orgs`, crossed with the memberships where the role is admin or member - gp-api falls
back to the personal account for anything else. Picking an org makes it the active account (1.2): the store and the
`gp_active_account` cookie are set, and the header shows the org's name instead of the GitHub username. Picking the personal
account switches back.

2.2 **"+ Add organization"**, the last item of the submenu, opens a modal with a table of the orgs the user could add - the
memberships where the role is admin or member that are not selected yet - each row with an "Add" button that appends the org to
`selected_orgs` on the user's own row. The sync keeps creating every org GitHub reports, and a user with twenty orgs should see
only the ones they care about; this modal is the one place that list grows. Adding does not switch: the org appears in the
submenu, and becomes active only when picked there.

## 3. Probes

3.1 **List and detail get an org view**: the org's probes, with edit controls gated on the role.

3.2 **Adoption is admin-only in org mode.** A non-admin is not offered it at all - neither the adoption code flow nor local
network adoption. The endpoints reject it either way; the UI must not show it.

3.3 **Every adoption call passes `accountId` explicitly** - the active account, personal or org: adoption-code `send-code` and
`verify-code`, and local-adoption `/adopt`. The legacy `userId` form and the implicit personal-account default stay only for the
old dashboard and are dropped in phase 5.

## 4. Credits

4.1 **Org stats and history in org view**, scoped by account like every other list. Redirects are not managed here: a user routes
their sponsorship from the migrate section (7.3), and an org's own redirect is on the Organization screen (6.2).

## 5. Tokens, approvals and the clients

5.1 **Tokens page in org mode** shows the user's own tokens and approvals inside the org; "generate token" creates an org item and
is disabled for viewers.

5.2 **The OAuth approval screen gains the account picker** and posts `accountId` on every approval, the personal account included.
Until this ships the field stays optional in gp-auth: the deployed screen posts only `approved`, and a missing `accountId` has to
keep meaning the personal account.

5.3 **The CLI, the chat bots and the MCP server** read `organization` from `/oauth/token/introspect` and say which account a token
acts for. Without it "Logged in as john" hides the fact that the credits come from an org.

## 6. The Organization screen

6.1 **A screen of its own, admins only.** A navigation entry directly under Tokens, rendered only for an admin of the active org.
The screen holds the org's settings first and its members second. The whole screen is admin-only, not just its controls: a member
sees no list of who else is in the org. That is what `gp_org_members.read` already enforces - `{user = me} OR {org where I am
admin}`, so a member can read their own membership row and nothing more - and this phase keeps it that way rather than widening it.

6.2 **Settings.**

- The org adoption token: copy and regenerate.
- The public probes switch (`gp_orgs.public_probes`), which makes the org's probes globally targetable as `u-<org name>`. This is
  what replaces "point my personal `default_prefix` at an org name" from phase 5 on: whoever wants org-named probes moves them
  into the org.
- The extra adoption tokens: the org's `extra_adoption_tokens`, each shown with the username it came from and removable. Without
  this list the tokens would be permanent and invisible: a member who migrated and then left could keep adopting probes into the
  org forever. The update hook accepts removals only (phase 3), so the UI cannot do anything worse than delete an entry.
- The org's own credits redirect, if it has one: `acme-org => john`, with a cross that clears it after a confirmation modal. These
  are the `org -> user` rows we inherited, and clearing it here is the only way one is ever removed.

6.3 **Members.** Every member with their role, and the role selector. Demoting someone to viewer deletes their org tokens and app
approvals - the database trigger does it (`20260813GP`) - so the selector warns before saving: it is irreversible and it breaks
whatever runs on those tokens.

## 7. "Migrate to organization"

7.1 **A section of the user settings.** It offers the orgs of `selected_orgs` where the user is an admin or a member - the list
the "Act as organization" menu offers (2.1). A viewer can move nothing, so an org where the user is only a viewer is left out, and
with no org left the section is not shown at all. That is the whole gate the dash can evaluate on its own (`account-migration.md`
§1); every other refusal comes from the endpoint.

7.2 **Four rows, four modals.** The section is a list of four entries, each a name and a button: transfer probes, transfer tokens,
transfer credits, redirect sponsorship credits. Each button opens its own modal, and each modal does exactly one of the four
things. The modal is the org select, with a help text to pick the organization and, if it is not in the list, to add it through
"+ Add organization" (2.2) first; then what the action does, and for the three transfers a warning that it is irreversible. The four
are independent and may be used at different times.

7.3 **What each modal says.**

- **Probes**: the probes' global tag changes to the org's name (the old one is replaced outright, no grace period), and the user's
  adoption token is handed to the org and replaced with a fresh one. The modal names both tags, and it says so when the org's
  public probes switch is off while the user's is on: the tag does not change then, it disappears, and the probes stop being
  globally targetable under any name until an admin turns the switch on (6.2).

  It is also the one transfer that can be refused for a reason the screen could not have known - the org already has an admin, so
  only an admin may hand probes over - so the error says exactly that. Nobody can do it on their behalf, since a transfer only
  ever moves the caller's own probes, so the way out is being made an admin of the org.
- **Tokens**: the tokens and their app approvals move, and what they spend from then on is the org's credits.
- **Credits**: the balance, the deductions and the sponsorship history move, and the sponsor bonus with them. If an
  `org -> user` redirect points at the user, the modal names it and says it stays: the org keeps sending its sponsorship to them
  until an admin of that org clears it on the Organization screen (6.2).
- **Redirect**: routing future sponsorship, not handing over anything that exists, so it is reversible and carries no warning.
  The row shows the current state next to the button, `john => acme-org`, with a cross that clears it after a confirmation modal.
  Picking an org replaces whatever the user had before.

## 8. Tests

8.1 **Component tests** per screen, with the role as the parameter - admin, member, viewer, outsider - asserting what is rendered
rather than what the API returns.

8.2 **e2e**: adding an org through "+ Add organization" and seeing it appear in the submenu, not yet active; switching the active
account and seeing every list follow it, and the header show the org's name; a viewer offered neither adoption nor token creation;
a member getting no Organization screen (6.1); the demotion warning; the migrate section hidden without a selected org where the
user is an admin or a member; each migration through its own modal, including an `org -> user` redirect staying in place after
the credits transfer and the new personal adoption token appearing in settings; a redirect set, shown and cleared.

## Deploy order

A single dash deploy. Directus, gp-api and gp-auth are untouched, and the external clients (5.3) follow on their own schedule since
introspect has been returning the account since phase 2.
