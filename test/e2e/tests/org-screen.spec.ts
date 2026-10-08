import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { actAsOrg, pageAs } from '../utils.ts';

const orgRow = (orgId: string) => sql('gp_orgs').where({ id: orgId }).first('adoption_token', 'public_probes', 'extra_adoption_tokens');
const roleOf = async (orgId: string, userId: string) => (await sql('gp_org_members').where({ org: orgId, user: userId }).first('role')).role as string;

test.afterEach(async ({ org }) => {
	await sql('gp_credits_redirects').where({ source_github_id: org.github_id }).delete();
});

test('the Organization screen is offered to an org admin only, and anyone else is sent to the overview', async ({ browser, org }) => {
	for (const [ user, isAdmin ] of [ [ org.admin, true ], [ org.member, false ], [ org.viewer, false ] ] as const) {
		const page = await actAsOrg(browser, org, user);
		await page.goto('/organization');

		if (isAdmin) {
			await expect(page.getByRole('heading', { name: 'Organization', level: 1 })).toBeVisible();
		} else {
			await expect(page).toHaveURL(/\/$/);
		}

		await expect(page.getByRole('link', { name: /Organization$/ })).toHaveCount(isAdmin ? 1 : 0);
		await page.context().close();
	}

	const page = await pageAs(browser, org.admin.email, 'user');
	await page.goto('/organization');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('link', { name: /Organization$/ })).toHaveCount(0);
});

test('an org admin regenerates the adoption token and makes the probes public with "Apply settings"', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/organization');

	const tokenInput = page.locator('#org-adoption-token');
	await expect(tokenInput).toHaveValue(org.adoption_token);
	await expect(page.getByRole('button', { name: 'Apply settings' })).toBeDisabled();

	await page.getByRole('button', { name: 'Regenerate' }).click();
	await expect(tokenInput).not.toHaveValue(org.adoption_token);
	const newToken = await tokenInput.inputValue();

	await page.locator('#org-public-probes').check();
	expect((await orgRow(org.id)).adoption_token).toBe(org.adoption_token);

	await page.getByRole('button', { name: 'Apply settings' }).click();
	await expect(page.getByText('Organization settings saved')).toBeVisible();

	const row = await orgRow(org.id);
	expect(row.adoption_token).toBe(newToken);
	expect(row.public_probes).toBe(1);
});

test('an org admin removes an extra adoption token after confirming', async ({ browser, org }) => {
	await sql('gp_orgs').where({ id: org.id }).update({
		extra_adoption_tokens: JSON.stringify([
			{ github_username: 'e2e-old-member', token: 'e2eoldtoken0000000000000000000000' },
			{ github_username: 'e2e-other-member', token: 'e2eothertoken00000000000000000000' },
		]),
	});

	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/organization');

	await expect(page.getByText('e2e-old-member')).toBeVisible();
	await expect(page.getByText('e2eold••••0000')).toBeVisible();
	await expect(page.getByText('e2eoldtoken0000000000000000000000')).toHaveCount(0);

	await page.getByRole('listitem').filter({ hasText: 'e2e-old-member' }).getByRole('button', { name: 'Remove' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();

	await expect(page.getByRole('listitem').filter({ hasText: 'e2e-old-member' })).toHaveCount(0);
	expect(JSON.parse((await orgRow(org.id)).extra_adoption_tokens)).toEqual([{ github_username: 'e2e-other-member', token: 'e2eothertoken00000000000000000000' }]);
});

test('an org admin sees the credits redirect of the org and clears it after confirming', async ({ browser, org }) => {
	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });

	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/organization');

	const redirect = page.getByRole('listitem').filter({ hasText: org.member.github_username });
	await expect(redirect).toContainText(org.name);

	await redirect.getByRole('button', { name: 'Clear' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Clear redirect' }).click();

	await expect(page.getByRole('heading', { name: 'Credits redirect' })).toHaveCount(0);
	expect(await sql('gp_credits_redirects').where({ source_github_id: org.github_id })).toHaveLength(0);
});

test('an org admin changes roles: promotion applies at once, demotion from admin or to viewer only after a warning', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/organization');

	await expect(page.getByRole('row').filter({ hasText: '(you)' })).toContainText(org.admin.github_username);
	await expect(page.getByLabel(`Role of ${org.admin.github_username}`)).toHaveCount(0);

	await page.getByLabel(`Role of ${org.viewer.github_username}`).click();
	await page.getByRole('option', { name: 'Member' }).click();
	await expect.poll(() => roleOf(org.id, org.viewer.id)).toBe('member');

	await page.getByLabel(`Role of ${org.viewer.github_username}`).click();
	await page.getByRole('option', { name: 'Admin' }).click();
	await expect.poll(() => roleOf(org.id, org.viewer.id)).toBe('admin');

	await page.getByLabel(`Role of ${org.viewer.github_username}`).click();
	await page.getByRole('option', { name: 'Member' }).click();
	await expect(page.getByRole('dialog')).toContainText('they\'ll become an admin again on their next sign-in');
	await page.getByRole('dialog').getByRole('button', { name: 'Change to member' }).click();
	await expect.poll(() => roleOf(org.id, org.viewer.id)).toBe('member');

	await page.getByLabel(`Role of ${org.member.github_username}`).click();
	await page.getByRole('option', { name: 'Viewer' }).click();
	await expect(page.getByRole('dialog')).toContainText('This can\'t be undone.');

	await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByLabel(`Role of ${org.member.github_username}`)).toContainText('Member');
	expect(await roleOf(org.id, org.member.id)).toBe('member');

	await page.getByLabel(`Role of ${org.member.github_username}`).click();
	await page.getByRole('option', { name: 'Viewer' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Change to viewer' }).click();
	await expect.poll(() => roleOf(org.id, org.member.id)).toBe('viewer');
});
