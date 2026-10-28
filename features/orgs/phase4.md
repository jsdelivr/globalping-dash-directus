# Phase 4: gp-dash org UI

Process: one screen at a time, each behind the endpoint that already enforces the rule. Per step: change, e2e tests, verify on the dev instance (dash 13010 against Directus 18055 with phases 1-3 applied), review. Then user reviews, commits and confirms next start of work with next step.

## What phases 1-3 already give us

- `directus_users.selected_orgs` (phase 1, written by nothing yet - this phase is what writes it) and `gp_orgs.public_probes`.
- The active account lives on the Directus session (`design.md`, Users): `POST /accounts/active` sets it, the signed claims carry it, and gp-api trusts them. Directus re-checks the membership on every refresh: the account must be the user's own or an org they are a member of, and a viewer's org may be read but runs no measurements (403).
- Every Directus endpoint takes `accountId`; `userId` survives only as a `// PHASE5: remove` shim for the old dashboard.
- `/oauth/token/introspect` returns the account a token acts for (phase 2).
- The `transfer-data` extension, `gp_credits_redirects`, the validated `gp_orgs.extra_adoption_tokens`, `directus_users.default_account` and the org website and description (phase 3).
- The `github_username` of each member, attached by a Directus hook to the rows of a top level `gp_org_members` read that includes `id` (phase 3), which is what the members list renders; a role is changed by the membership `id`. It can not be named in `fields` and it does not survive a nested read, so the list is its own request and the name is taken off the rows.

## Contract for this phase

- **Ships together with phase 3.** One Directus deploy carries both phases, then gp-api, then the dash (see Deploy order). gp-auth is not deployed. The external clients (5.3, 5.4) are released from their own repos on their own schedule.
- **The UI never grants anything.** Every role gate here mirrors a rule the endpoint already enforces; disabling a control is a courtesy, not a security boundary. What the UI disables is what it can decide from the caller's own role, which it knows: an action the role may not take stays visible, greyed out, with a tooltip saying who can take it. What depends on org state the caller cannot read - above all whether the org already has an org admin, which a member cannot see - is left to the endpoint and surfaced as an explicit error. Pre-hiding those would mean building a channel that discloses the org's roster to every member just to grey out a button.
- **Irreversible actions are spelled out before they run.** Two of them live in this phase: the transfers (7) and demoting a member to viewer (6.3).
- **The default account follows the user, the switch follows the session.** A new session starts in `directus_users.default_account` (phase 3, 5b), the same on every device; switching in the menu lasts until that session ends.

## 1. Acting as an organization

1.1 **Account store.** Memberships and roles load on login as part of the user (`readMe` with `memberships`); the user's own account id comes from the `account` alias Directus already returns (phase 1). `useAccount` exposes `personal`, the user's own account, and `current`, the account everything is shown and billed for - the active org or `personal`. Everything downstream filters by an account id, never by a user id.

1.2 **Active account.** Kept on the Directus session, never in browser state: the dash switches with `POST /accounts/active` and reads it with `GET /accounts/active`, and gp-api and globalping.io read the same session, so the three always agree on which account is billed. A new session starts in the user's `default_account` while it is still valid - the personal account or an org the user is a member of - and in the personal account otherwise; Directus decides this when it signs the session, so a user who signed in elsewhere acts as their default account before the dash is opened. Directus re-checks the membership on every refresh and falls back the same way, so an org the user has left stops applying within one session lifetime. Switching never touches `default_account`. The claims also carry the tier of the active account, so a measurement from the dash is stored like one made with the account's API token (phase 3, 4.2).

1.3 **Directus admin mode and impersonation.** A Directus admin gets the switch with their own orgs like any user. Only while "Show data of all users" is on does the dash show every user's data unfiltered: that has no active account, so the switch is hidden, and turning it off brings the Directus admin's active org back. Impersonation acts as the impersonated user: the switch offers their orgs, read-only like the rest of their settings - "+ Add organization" shows their selection but cannot change it - and their memberships are loaded once with the user when the impersonation starts, since `readMe` answers for the Directus admin. An impersonation starts in the impersonated user's personal account, not their default. The active org of an impersonation lives in the browser tab only, tied to the impersonated user so a value left from another impersonation is ignored, and the Directus admin's own session is not touched.

1.4 **gp-auth ignores the active account.** The account for an approval is picked on the consent screen (5.2), never inherited from browser state. Keep the two concepts separate in the store or the consent screen will silently approve for whatever the header last switched to.

1.5 **Settings and notifications stay personal.** `/settings` is always the user's own, whatever account is active. The notifications list is the user's own too, and holds the org notifications of the orgs they administer next to the personal ones: the org fans them out to its org admins (phase 1) with the same text as a personal one and without naming the org, so the list cannot tell them apart yet.

## 2. The "Act as organization" menu

2.1 **Where it lives.** An "Act as organization" entry in the user menu, between Settings and Sign out. It expands into a list of the personal account and the user's `selected_orgs`, whatever the role there. A viewer acts as the org read-only - the org's probes, credits and history, and none of the controls that write (3.2, 5.1, 6.1); a viewer has no write access to the org anywhere, so browsing it is the whole point of the role. Picking an org makes it the active account (1.2), and the header shows `Org (username)` instead of the GitHub username, with an "Organization role" badge in place of "Account type"; hovering the role explains what each of the three roles can do. Picking the personal account switches back.

2.2 **"+ Add organization"**, the last item of the submenu, opens a modal with a table of the user's memberships, each row with an "Add" button that appends the org to `selected_orgs` on the user's own row, or a "Remove" button for an org already selected. The sync keeps creating every org GitHub reports, and a user with twenty orgs should see only the ones they care about; this modal is the one place that list changes. Adding does not switch: the org appears in the submenu, and becomes active only when picked there. Removing the active org switches back to the personal account.

## 3. Probes

3.1 **List and detail get an org view**: the org's probes, with edit controls gated on the role - name, location, settings, tags and delete stay visible to every member of the org but are editable by org admins only, since `gp_probes` updates are limited to the own account or an org admin; a disabled control says so in a tooltip. Restarting a probe is only for org admins too (gp-api refuses it otherwise). A new tag is offered one prefix only, the owner's own name: the org's name on an org probe, the `github_username` on a personal one (the prefix is shown as text, not a select). A saved tag keeps offering its own prefix, so an old `u-<other name>` tag can still be edited without being renamed. This narrows the UI only: Directus keeps accepting the personal account's `github_organizations` until phase 5 (`getAccountTagPrefixes`). The public probes switches on a probe (after adoption and on the location target) read and write `gp_orgs.public_probes` in org mode, editable by org admins only; writing the personal `public_probes` there changes nothing for the org's probes.

3.2 **Adoption is only for org admins in org mode.** An action a role cannot take is shown disabled with a tooltip saying who can, never hidden: "Adopt a probe" and "Start a probe" are greyed out for a member or a viewer. The endpoints reject adoption either way. The start commands embed the adoption token of the account the probe will be adopted into: the personal one in the personal account, the org's for an org admin (the `gp_orgs` read hook returns `adoption_token` to org admins only, and only on a direct `gp_orgs` read). The update commands of an org probe carry no token for a member or a viewer, since recreating the container with their personal token would move the probe into their personal account, and the outdated-software notice that links to them is not shown to them. The local network adoption popup is not shown to them either: it is a prompt, not an action.

3.3 **Every adoption call passes `accountId` explicitly** - the active account, personal or org: adoption-code `send-code` and `verify-code`, and local-adoption `/adopt`. The legacy `userId` form and the implicit personal-account default stay only for the old dashboard and are dropped in phase 5.

## 4. Credits

4.1 **Org stats and history in org view**, scoped by account like every other list. Redirects are not managed here: a user routes their sponsorship from the migrate section (7.3), and an org's own redirect is on the Organization screen (6.2).

## 5. Tokens, approvals and the clients

5.1 **Tokens page in org mode** shows the user's own tokens and approvals inside the org; "generate token" creates an org item and is disabled for viewers, with a tooltip saying why. The create call passes `account_id` of the active account: without it a database trigger fills in the creator's personal account, so a token generated in org mode lands in the personal list and never appears in the org's.

5.2 **The OAuth approval screen gains the account picker** and posts `accountId` on every approval, the personal account included. The picker offers the personal account and the `selected_orgs` where the role is admin or member: gp-auth refuses an approval for an org where the user is a viewer, so a viewer's orgs are left out rather than offered and refused. The picker is a select that starts on the active account when it is offered, then on the default account when that is offered, and on the personal account otherwise. Until this ships the field stays optional in gp-auth: the deployed screen posts only `approved`, and a missing `accountId` has to keep meaning the personal account.

5.3 **The CLI, the chat bots and the MCP server** (`globalping-cli`, `globalping-chat-bots`, `globalping-mcp-server`) read `organization` from `/oauth/token/introspect` and say which account a token acts for. Without it "Logged in as john" hides the fact that the credits come from an org.

5.4 **globalping.io** (`globalping.io` repo) shows the signed-in account in its header, today the `github_username` from `/users/me`. It reads the active account of the same session (1.2) and shows `Org (username)` while an org is active, since that is the account its measurements are billed to; the name comes from the memberships `/users/me` returns. The site never changes the active account. A viewer's org is shown like any other: it is the active account, and the measurement gp-api refuses for it says why.

## 6. The Organization screen

6.1 **A screen of its own, org admins only.** A navigation entry directly under Tokens, rendered only for an org admin of the active org. The screen holds the org's settings first and its members second. The whole screen is only for org admins, not just its controls: a member sees no list of who else is in the org. That is what `gp_org_members.read` already enforces - `{user = me} OR {org where I am admin}`, so a member can read their own membership row and nothing more - and this phase keeps it that way rather than widening it.

6.2 **Settings.**

- The org adoption token: copy and regenerate.
- The public probes switch (`gp_orgs.public_probes`), which makes the org's probes globally targetable as `u-<org name>`. This is what replaces "point my personal `default_prefix` at an org name" from phase 5 on: whoever wants org-named probes moves them into the org.
- The extra adoption tokens: the org's `extra_adoption_tokens`, each shown with the username it came from and removable. Without this list the tokens would be permanent and invisible: a member who migrated and then left could keep adopting probes into the org forever. The update hook accepts removals only (phase 3), so the UI cannot do anything worse than delete an entry.
- The org's credits redirects in both directions - an inherited `acme-org => john` and a member's `john => acme-org` - each cleared after a confirmation. The person on the other side can clear theirs in the migrate section (7.3), and pointing their own sponsorship somewhere ends it too.

6.3 **Members.** Every member with their role, and the role selector. Demoting someone to viewer deletes their org tokens and app
approvals - the database trigger does it (`20261028GP`) - so the selector warns before saving: it is irreversible and it breaks
whatever runs on those tokens.

## 7. "Migrate to organization"

7.1 **A section of the user settings.** It offers the orgs of `selected_orgs` where the user is an org admin or a member - the list the consent screen offers (5.2). A viewer can move nothing, so an org where the user is only a viewer is left out. The section is always shown, since it is about the user's own data whatever account is active; with no org left its button is disabled and a line says why and how to add one. That is the whole gate the dash can evaluate on its own (`account-migration.md` §1); every other refusal comes from the endpoint.

7.2 **One dialog, four rows.** The section is a single "Migrate to organization" button, like "Delete account". It opens one dialog: the org select on top, empty on open, so the org is always picked on purpose, with a help text to add a missing org through "+ Add organization" (2.2) first; then four rows, each a name, what it does for the picked org and a button: transfer probes, transfer tokens, transfer credits, redirect sponsorship credits. The three transfers are irreversible, so their button asks for an inline confirmation in the row before it runs. An error is shown in its row, and a finished action turns its row into what was moved, with the counts the endpoint returns; the dialog stays open, since the four are independent and may be used at different times.

7.3 **What each row says.**

- **Probes**: the probes' global tag changes to the org's name (the old one is replaced outright, no grace period), and the user's adoption token is handed to the org and replaced with a fresh one. The row says what happens to the global tag, including when the org's public probes switch is off while the user's is on: the tag does not change then, it disappears, and the probes stop being globally targetable under any name until an org admin turns the switch on (6.2).

  It is also the one transfer that can be refused for a reason the screen could not have known - the org already has an org admin, so only an org admin may hand probes over - so the error says exactly that. Nobody can do it on their behalf, since a transfer only ever moves the caller's own probes, so the way out is being made an org admin of the org.
- **Tokens**: the tokens and their app approvals move, and what they spend from then on is the org's credits.
- **Credits**: the balance, the deductions and the sponsorship history move, and the sponsor bonus with them. If an `org -> user` redirect points at the user, the row names it and says it stays: the org keeps sending its sponsorship to them until either side clears it - an org admin of that org on the Organization screen (6.2), or the user in the redirect row below.
- **Redirect**: routing future sponsorship, not handing over anything that exists, so it is reversible and carries no irreversibility warning. Like a transfer, it may make the user an admin of an org that has none, and the toast says so. The row lists the current redirects in both directions - the user's own `john => acme-org` and an inherited `acme-org => john` pointing at them - each cleared after an inline confirmation. Picking an org replaces whatever the user had before, and ends every redirect pointing at them, so when any exist the button asks for an inline confirmation naming them.

## 7b. Onboarding and the default account

7b.1 **The onboarding dialog.** A GitHub user whose `default_account` is still null gets a dialog on whatever page they land on, outside impersonation: "Which account should open by default?", with two cards, Personal and Organization, and a note that it only sets the default: the menu switches accounts any time and Settings changes the default. "Skip" makes the personal account the default, and so does closing the dialog in any way - the cross, Escape or a click outside. Existing users see it once as well, since their `default_account` starts null.

7b.2 **Personal** offers the user's public probes switch. **Organization** offers every org the user is a member of, in any role, including the ones not yet in `selected_orgs`; applying adds the org there, makes its account the default and switches to it. An org admin of the picked org also gets the org's public probes switch and, while the org has neither a website, a description nor a banner, those fields and the banner upload (7c.3) under "Improve your public profile (optional)"; a member or a viewer gets only the select. A user in no org sees the Organization card disabled with the reason.

7b.3 **Changing it later.** The default account is a select in the account details of the user settings, shown when there is more than the personal account to pick: the personal account plus the selected orgs. The org's website (an `https://` URL) and description (up to 200 characters, with a counter) are edited by its org admins in the General section of the Organization screen.

## 7c. Organization banners

7c.1 **Storage.** `gp_orgs.banner` is a nullable M2O to `directus_files` (`ON DELETE SET NULL`), readable by the members like the rest of the profile but not in the update permission: only the endpoint below writes it. The files live in an "Organization banners" folder. The Public and the User policies may read `directus_files` in that folder only, and only the `id`, which is all `/assets/:id` needs, so a listing of the files names no org - both, because a signed-in user does not get the Public permissions and the dash's `<img>` requests carry the session cookie. Deleting an org deletes its banner file.

7c.2 **Endpoint** (`organizations` extension):

- `GET /organizations` - public. `[{ name, website, description, bannerId }]` of the orgs with `public_probes` on and at least a website, a description or a banner.
- `GET /organizations/:name` - the same shape for one org, the name matched case-insensitively; 404 when it is missing or not listed.
- `POST /organizations/:id/banner` - an org admin of the org, or a Directus admin. The body is the raw image. It must be at most 5 MB, a PNG, JPEG or WebP judged by its bytes, at least 1224×200 px and no larger than Directus will transform, and the `banner` preset must render it; anything else is refused and nothing is kept. The previous banner is deleted only once the org points at the new one. Returns `{ bannerId }`. Errors are plain-text messages meant for the dash.
- `DELETE /organizations/:id/banner` - same access; unsets the banner and deletes the file. Idempotent.

The original stays reachable as `/assets/<bannerId>` with whatever metadata it carried; decoding, EXIF orientation and the WebP output all happen in Directus's own preset transformation, under its size, concurrency and time limits.

7c.3 **Serving.** The asset settings allow presets only (`storage_asset_transform: presets`), with one preset, `banner`: cover-cropped to 1224×200, WebP quality 80. A banner is shown as `${directusUrl}/assets/<bannerId>?key=banner`; arbitrary transformations such as `?width=10` are refused, so the public folder can't be used to make Directus resize images on demand.

7c.4 **Dash.** The banner block sits with the website and the description, on the Organization screen and in the onboarding: "Upload banner" with the limits as a hint, a preview cropped like the preset, and "Upload image", or "Replace" and "Remove" once there is one. A picked file is checked in the browser against the same limits and only staged with a local preview; it is uploaded, or a staged removal sent, by the screen's "Apply settings" or the onboarding's "Apply", together with the other fields.

7c.5 **Deploy notes.** The migration needs the schema applied first (the `banner` column) and a Directus restart afterwards. Later, a CDN subdomain in front of `/assets` can serve the banners; nothing in the URLs depends on Directus's own host except the base.

## 8. Remaining

8.1 **The text around the start commands names the account** the probe will be adopted into: the personal one in the personal account ("under my account"), the org's for an org admin ("Adopt the probe under the <org> organization", "includes the secret adoption token of the <org> organization").

8.2 **The org admin's own notification settings for the org**, kept on their membership (`notification_preferences`): the same types and defaults as the personal ones, and each org admin sets their own. UI only: the dash reads and writes the org admin's own `gp_org_members.notification_preferences`, in the same block as the personal settings. The backend already exists.

8.3 **The personal default tag prefix is softly retired.** The settings page hides "Default tag prefix" while `default_prefix` equals the `github_username`, along with the copy that offers switching to an org name ("To use your organization name instead, change your default tag prefix above"): a user who never moved off the username is not invited to start using an org name now, since org-named probes belong in the org (6.2). A user whose `default_prefix` is an org name still sees the selector, with two options - the current value and the `github_username` - so they can move back to the username; once they do, the selector disappears for good. The backend keeps accepting `github_organizations` until phase 5, which narrows `validateDefaultPrefix` to the same two values.

## 9. Tests

Playwright e2e only, in the `globalping-dash-directus` repo (`test/e2e`), on its `phase-4` branch: the dash's `build-directus.sh` clones that repo by the dash's branch name. Each screen is covered for every role that can reach it.

9.1 **Scenarios**: adding an org through "+ Add organization" and seeing it appear in that list, not yet active; switching the active account and seeing every list follow it, and the header show `Org (username)`; removing the active org switching back to the personal account; a viewer seeing the org's probes and credits, offered neither adoption nor token creation; the consent screen offering no org where the user is a viewer; a member getting no Organization screen (6.1); the demotion warning; the migrate button disabled and explained without a selected org where the user is an org admin or a member; each migration from the dialog, including an `org -> user` redirect staying in place after the credits transfer and the new personal adoption token appearing in settings; a redirect set, shown and cleared, in both directions; the onboarding dialog skipped, applied for the personal account and for an org as an org admin and as a member, the profile fields hidden once filled, the Organization card disabled for a user in no org; a new session opening the default account, an unavailable default falling back to personal, and a switch lasting for the session; the consent screen falling back to the default account; the default account changed in the settings and the org profile edited on the Organization screen; a banner staged, uploaded, replaced and removed on the Organization screen and in the onboarding, and refused in the browser when too small. The banner endpoint itself has its own API tests (`org-banners.spec.ts`).

## Deploy order

Phases 3 and 4 ship together: Directus first (schema, migrations, restart - 7c.5), then gp-api, which reads the columns phase 3 adds, then the dash and globalping.io. Until the dash ships, the endpoints have to work with the phase 2 readers still running. gp-auth is untouched, and the external clients (5.3) follow on their own schedule since introspect has been returning the account since phase 2.
