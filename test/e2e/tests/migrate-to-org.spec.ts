import { randomUUID } from 'node:crypto';
import type { Browser, Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import type { Org, User } from '../types.ts';
import { actAsOrg, addApplication, addProbe, demoteTheAdmin, pageAs } from '../utils.ts';

// Opens the settings of the personal account, with the org offered in the account menu.
const settingsWithOrg = async (browser: Browser, org: Org, user: User) => {
	await sql('directus_users').where({ id: user.id }).update({ selected_orgs: JSON.stringify([ org.id ]) });
	const page = await pageAs(browser, user.email, 'user');
	await page.goto('/settings');
	return page;
};

const openMigration = async (page: Page, org: Org) => {
	const dialog = page.locator('.rounded-xl').filter({ has: page.getByRole('heading', { name: 'Transfer to an organization' }) });
	const combobox = dialog.getByRole('combobox');

	await expect(combobox).toContainText('Select an organization');
	await expect(dialog.getByRole('alert')).toHaveCount(0);
	await combobox.click();
	await page.getByRole('option').filter({ hasText: org.name }).click();
	await expect(dialog.getByRole('alert')).toBeVisible();
	return dialog;
};

// The three transfers ask for a confirmation in a dialog before they run.
const transfer = async (dialog: Locator, button: string) => {
	await dialog.getByRole('button', { name: button }).click();
	const confirmation = dialog.page().getByRole('dialog');
	await expect(confirmation).toContainText('This transfer cannot be undone.');
	await confirmation.getByRole('button', { name: button }).click();
};

const probesOf = async (accountId: string) => (await sql('gp_probes').where({ account_id: accountId }).select('id')).map(({ id }) => id as string);
const tokensOf = async (accountId: string) => (await sql('gp_tokens').where({ account_id: accountId }).select('id')).length;
const approvalsOf = async (accountId: string) => (await sql('gp_apps_approvals').where({ account_id: accountId }).select('id')).length;
const creditsOf = async (accountId: string) => (await sql('gp_credits').where({ account_id: accountId }).first('amount'))?.amount as number | undefined;

const redirectsOf = (dialog: Locator) => dialog.getByRole('list', { name: 'Current redirects' }).getByRole('listitem');

test.afterEach(async ({ org }) => {
	await sql('gp_credits_redirects').where({ source_github_id: org.github_id }).orWhere({ target_github_id: org.github_id }).delete();
});

test('migration lists admin and member organizations independently of the account menu', async ({ browser, org }) => {
	const noOrgs = 'No organizations are available for transfers. You need an admin or member role.';
	const migrate = (page: Page) => page.locator('#migrate-org');

	const viewerPage = await settingsWithOrg(browser, org, org.viewer);
	await expect(migrate(viewerPage)).toBeDisabled();
	await expect(viewerPage.getByText(noOrgs)).toBeVisible();

	const memberPage = await settingsWithOrg(browser, org, org.member);
	await expect(migrate(memberPage)).toBeEnabled();
	await expect(memberPage.getByText(noOrgs)).toHaveCount(0);

	await sql('directus_users').where({ id: org.member.id }).update({ selected_orgs: JSON.stringify([]) });
	await memberPage.reload();
	await expect(migrate(memberPage)).toBeEnabled();
	await expect(memberPage.getByText(noOrgs)).toHaveCount(0);
	await openMigration(memberPage, org);
	expect(JSON.parse((await sql('directus_users').where({ id: org.member.id }).first('selected_orgs')).selected_orgs)).toEqual([]);
});

test('probes move into an org with no admin, the user becomes its admin and gets a new adoption token', async ({ browser, org }) => {
	await demoteTheAdmin(org);
	await sql('directus_users').where({ id: org.member.id }).update({ public_probes: true });
	const probeId = await addProbe({ account_id: org.member.account_id });

	const page = await settingsWithOrg(browser, org, org.member);
	const dialog = await openMigration(page, org);
	await expect(dialog).toContainText(`Their public tag u-${org.member.default_prefix} is removed`);
	await transfer(dialog, 'Transfer probes');

	await expect(page.getByText(`Transferred 1 probe to ${org.name}`, { exact: true })).toBeVisible();
	await expect(dialog).toContainText('Transferred 1 probe');
	await expect(dialog.getByRole('button', { name: 'Transfer probes' })).toHaveCount(0);
	expect(await probesOf(org.member.account_id)).toEqual([]);
	expect(await probesOf(org.account_id)).toEqual([ probeId ]);

	const newToken = (await sql('directus_users').where({ id: org.member.id }).first('adoption_token')).adoption_token;
	await expect(page.locator('#adoption-token')).toHaveValue(newToken);
});

test('a member moving probes into an org with an admin is told inside the dialog what to do', async ({ browser, org }) => {
	await sql('directus_users').where({ id: org.member.id }).update({ public_probes: true });
	await sql('gp_orgs').where({ id: org.id }).update({ public_probes: true });
	const probeId = await addProbe({ account_id: org.member.account_id });

	const page = await actAsOrg(browser, org, org.member);
	await page.goto('/settings');
	const dialog = await openMigration(page, org);
	await expect(dialog).toContainText(`Their public tag changes from u-${org.member.default_prefix} to u-${org.name}.`);
	await transfer(dialog, 'Transfer probes');

	await expect(dialog).toContainText(`Only organization admins can transfer probes to ${org.name}. Ask an existing admin to change your role.`);
	expect(await probesOf(org.member.account_id)).toEqual([ probeId ]);
	expect(await probesOf(org.account_id)).toEqual([]);
});

test('an admin moving probes into their own org keeps their role and is not told they became an admin', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.admin.account_id });

	const page = await settingsWithOrg(browser, org, org.admin);
	const dialog = await openMigration(page, org);
	await transfer(dialog, 'Transfer probes');

	await expect(page.getByText(`Transferred 1 probe to ${org.name}`, { exact: true })).toBeVisible();
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

	await expect(page.getByText(`Transferred 0 tokens and 1 app to ${org.name}`)).toBeVisible();
	await expect(dialog).toContainText('Transferred 0 tokens and 1 app');
	expect([ await tokensOf(org.member.account_id), await approvalsOf(org.member.account_id) ]).toEqual([ 0, 0 ]);
	expect([ await tokensOf(org.account_id), await approvalsOf(org.account_id) ]).toEqual([ 1, 1 ]);
});

test('credits move to the org, and a redirect from that org to the user stays', async ({ browser, org }) => {
	await sql('gp_credits').insert({ account_id: org.member.account_id, amount: 1500 });
	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });

	const page = await settingsWithOrg(browser, org, org.member);
	const dialog = await openMigration(page, org);
	await expect(dialog).toContainText(`Sponsorship credits for ${org.name} will continue going to your personal account.`);
	await transfer(dialog, 'Transfer credits');

	await expect(page.getByText(`Transferred 1,500 credits to ${org.name}`)).toBeVisible();
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
	await expect(page.getByRole('dialog')).toContainText(`This will remove the existing redirects: ${org.name} → ${org.member.github_username}.`);
	await page.getByRole('dialog').getByRole('button', { name: 'Redirect credits' }).click();
	await expect(redirects).toHaveText(new RegExp(`${org.member.github_username}.*${org.name}`));
	await expect(dialog.getByRole('button', { name: 'Redirect credits' })).toHaveCount(0);
	await expect(dialog).toContainText('Sponsorship credits redirected');

	await redirects.getByRole('button', { name: 'Remove' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
	await expect(redirects).toHaveCount(0);

	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });
	await page.reload();
	await openMigration(page, org);
	await expect(redirects).toHaveText(new RegExp(`${org.name}.*${org.member.github_username}`));

	await redirects.getByRole('button', { name: 'Remove' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
	await expect(redirects).toHaveCount(0);
	expect(await sql('gp_credits_redirects').where({ source_github_id: org.github_id }).select('id')).toHaveLength(0);
});
