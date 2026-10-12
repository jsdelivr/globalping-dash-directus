import { randomUUID } from 'node:crypto';
import type { Browser, Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import type { Org, User } from '../types.ts';
import { actAsOrg, addApplication, addProbe, pageAs } from '../utils.ts';

const demoteTheAdmin = (org: Org) => sql('gp_org_members').where({ org: org.id, user: org.admin.id }).update({ role: 'member' });

// Opens the settings of the personal account, with the org offered in the account menu.
const settingsWithOrg = async (browser: Browser, org: Org, user: User) => {
	await sql('directus_users').where({ id: user.id }).update({ selected_orgs: JSON.stringify([ org.id ]) });
	const page = await pageAs(browser, user.email, 'user');
	await page.goto('/settings');
	return page;
};

const openMigration = async (page: Page, org: Org) => {
	await page.getByRole('button', { name: 'Migrate to organization' }).click();
	const dialog = page.getByRole('dialog');
	const combobox = dialog.getByRole('combobox');

	await expect(combobox).toContainText('Select an organization');
	await combobox.click();
	await page.getByRole('option').filter({ hasText: org.name }).click();
	return dialog;
};

// The three transfers ask for an inline confirmation in their row before they run.
const transfer = async (dialog: Locator, button: string) => {
	await dialog.getByRole('button', { name: button }).click();
	await expect(dialog).toContainText('This can\'t be undone.');

	// The row keeps its own button, disabled, next to the confirming one.
	await dialog.getByRole('button', { name: button }).last().click();
};

const probesOf = async (accountId: string) => (await sql('gp_probes').where({ account_id: accountId }).select('id')).map(({ id }) => id as string);
const tokensOf = async (accountId: string) => (await sql('gp_tokens').where({ account_id: accountId }).select('id')).length;
const approvalsOf = async (accountId: string) => (await sql('gp_apps_approvals').where({ account_id: accountId }).select('id')).length;
const creditsOf = async (accountId: string) => (await sql('gp_credits').where({ account_id: accountId }).first('amount'))?.amount as number | undefined;

const redirectsOf = (dialog: Locator) => dialog.getByRole('list', { name: 'Current redirects' }).getByRole('listitem');

test.afterEach(async ({ org }) => {
	await sql('gp_credits_redirects').where({ source_github_id: org.github_id }).orWhere({ target_github_id: org.github_id }).delete();
});

test('migration is offered only with a selected org where the user is an admin or a member, and explained otherwise', async ({ browser, org }) => {
	const noOrgs = 'You have no organizations to migrate to.';
	const migrate = (page: Page) => page.getByRole('button', { name: 'Migrate to organization' });

	const viewerPage = await settingsWithOrg(browser, org, org.viewer);
	await expect(migrate(viewerPage)).toBeDisabled();
	await expect(viewerPage.getByText(noOrgs)).toBeVisible();

	const memberPage = await settingsWithOrg(browser, org, org.member);
	await expect(migrate(memberPage)).toBeEnabled();
	await expect(memberPage.getByText(noOrgs)).toHaveCount(0);

	await sql('directus_users').where({ id: org.member.id }).update({ selected_orgs: JSON.stringify([]) });
	await memberPage.reload();
	await expect(migrate(memberPage)).toBeDisabled();
	await expect(memberPage.getByText(noOrgs)).toBeVisible();
});

test('probes move into an org with no admin, the user becomes its admin and gets a new adoption token', async ({ browser, org }) => {
	await demoteTheAdmin(org);
	await sql('directus_users').where({ id: org.member.id }).update({ public_probes: true });
	const probeId = await addProbe({ userId: org.member.id, account_id: org.member.account_id });

	const page = await settingsWithOrg(browser, org, org.member);
	const dialog = await openMigration(page, org);
	await expect(dialog).toContainText(`Their public tag u-${org.member.default_prefix} disappears`);
	await transfer(dialog, 'Transfer probes');

	await expect(page.getByText(`Moved 1 probe to ${org.name}. You're now an admin of ${org.name}`)).toBeVisible();
	await expect(dialog).toContainText('Moved 1 probe');
	await expect(dialog.getByRole('button', { name: 'Transfer probes' })).toHaveCount(0);
	expect(await probesOf(org.member.account_id)).toEqual([]);
	expect(await probesOf(org.account_id)).toEqual([ probeId ]);

	await page.keyboard.press('Escape');
	const newToken = (await sql('directus_users').where({ id: org.member.id }).first('adoption_token')).adoption_token;
	await expect(page.locator('#adoption-token')).toHaveValue(newToken);
});

test('a member moving probes into an org with an admin is told inside the dialog what to do', async ({ browser, org }) => {
	await sql('directus_users').where({ id: org.member.id }).update({ public_probes: true });
	await sql('gp_orgs').where({ id: org.id }).update({ public_probes: true });
	const probeId = await addProbe({ userId: org.member.id, account_id: org.member.account_id });

	const page = await actAsOrg(browser, org, org.member);
	await page.goto('/settings');
	const dialog = await openMigration(page, org);
	await expect(dialog).toContainText(`Their public tag changes from u-${org.member.default_prefix} to u-${org.name}.`);
	await transfer(dialog, 'Transfer probes');

	await expect(dialog).toContainText(`Only admins can move probes into ${org.name} once it has an admin, so ask one to make you an admin.`);
	expect(await probesOf(org.member.account_id)).toEqual([ probeId ]);
	expect(await probesOf(org.account_id)).toEqual([]);
});

test('an admin moving probes into their own org keeps their role and is not told they became an admin', async ({ browser, org }) => {
	const probeId = await addProbe({ userId: org.admin.id, account_id: org.admin.account_id });

	const page = await settingsWithOrg(browser, org, org.admin);
	const dialog = await openMigration(page, org);
	await transfer(dialog, 'Transfer probes');

	await expect(page.getByText(`Moved 1 probe to ${org.name}`, { exact: true })).toBeVisible();
	await expect(page.getByText('You\'re now an admin')).toHaveCount(0);
	expect(await probesOf(org.admin.account_id)).toEqual([]);
	expect(await probesOf(org.account_id)).toEqual([ probeId ]);
});

test('an empty transfer is explained inside the dialog', async ({ browser, org }) => {
	const page = await settingsWithOrg(browser, org, org.member);
	const dialog = await openMigration(page, org);
	await transfer(dialog, 'Transfer tokens');

	await expect(dialog).toContainText('You have no tokens or app approvals to transfer.');
});

test('tokens and their app approvals move to the org', async ({ browser, org }) => {
	await addApplication({ accountId: org.member.account_id, userId: org.member.id });

	const page = await settingsWithOrg(browser, org, org.member);
	const dialog = await openMigration(page, org);
	await transfer(dialog, 'Transfer tokens');

	await expect(page.getByText(`Moved 1 token and 1 app approval to ${org.name}`)).toBeVisible();
	await expect(dialog).toContainText('Moved 1 token and 1 app approval');
	expect([ await tokensOf(org.member.account_id), await approvalsOf(org.member.account_id) ]).toEqual([ 0, 0 ]);
	expect([ await tokensOf(org.account_id), await approvalsOf(org.account_id) ]).toEqual([ 1, 1 ]);
});

test('credits move to the org, and a redirect from that org to the user stays', async ({ browser, org }) => {
	await sql('gp_credits').insert({ account_id: org.member.account_id, amount: 1500 });
	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });

	const page = await settingsWithOrg(browser, org, org.member);
	const dialog = await openMigration(page, org);
	await expect(dialog).toContainText(`${org.name}'s sponsorship credits will still be added to your personal account.`);
	await transfer(dialog, 'Transfer credits');

	await expect(page.getByText(`Moved 1,500 credits to ${org.name}`)).toBeVisible();
	await expect(redirectsOf(dialog)).toHaveText(new RegExp(`${org.name}.*${org.member.github_username}`));
	expect(await creditsOf(org.member.account_id)).toBeUndefined();
	expect(await creditsOf(org.account_id)).toBe(1500);
});

test('a redirect set while acting as the org replaces an inherited one, and both directions can be cleared', async ({ browser, org }) => {
	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });

	const page = await actAsOrg(browser, org, org.member);
	await page.goto('/settings');
	const dialog = await openMigration(page, org);
	const redirects = redirectsOf(dialog);

	await expect(redirects).toHaveText(new RegExp(`${org.name}.*${org.member.github_username}`));

	// Redirecting removes the existing redirects, so it asks first when there are any.
	await dialog.getByRole('button', { name: 'Redirect credits' }).click();
	await expect(dialog).toContainText(`This removes ${org.name} → ${org.member.github_username}.`);
	await dialog.getByRole('button', { name: 'Redirect credits' }).last().click();
	await expect(redirects).toHaveText(new RegExp(`${org.member.github_username}.*${org.name}`));
	await expect(dialog.getByRole('button', { name: 'Redirect credits' })).toHaveCount(0);
	await expect(dialog).toContainText('Redirected');

	await redirects.getByRole('button', { name: 'Clear' }).click();
	await redirects.getByRole('button', { name: 'Clear' }).click();
	await expect(redirects).toHaveCount(0);

	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });
	await page.reload();
	await openMigration(page, org);
	await expect(redirects).toHaveText(new RegExp(`${org.name}.*${org.member.github_username}`));

	await redirects.getByRole('button', { name: 'Clear' }).click();
	await redirects.getByRole('button', { name: 'Clear' }).click();
	await expect(redirects).toHaveCount(0);
	expect(await sql('gp_credits_redirects').where({ source_github_id: org.github_id }).select('id')).toHaveLength(0);
});
