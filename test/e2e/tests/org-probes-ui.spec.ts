import type { Browser, Locator } from '@playwright/test';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import type { Org, User } from '../types.ts';
import { addProbe, pageAs } from '../utils.ts';

const ADMIN_ONLY_HINT = 'Only organization admins can do this';

const actAsOrg = async (browser: Browser, org: Org, user: User) => {
	await sql('directus_users').where({ id: user.id }).update({ selected_orgs: JSON.stringify([ org.id ]) });
	const page = await pageAs(browser, user.email, 'user');
	await page.context().addCookies([{ name: 'gp_active_account', value: `${user.id}:${org.account_id}`, url: process.env.DASH_URL! }]);
	return page;
};

const expectEditable = async (locator: Locator, editable: boolean) => editable ? expect(locator).toBeEnabled() : expect(locator).toBeDisabled();

test('adoption is available to an org admin, and shown disabled to everyone else in the org', async ({ browser, org }) => {
	for (const [ user, editable ] of [ [ org.admin, true ], [ org.member, false ], [ org.viewer, false ] ] as const) {
		const page = await actAsOrg(browser, org, user);

		await page.goto('/');
		await expect(page.getByLabel('Profile')).toContainText(org.name);
		await expectEditable(page.getByRole('button', { name: /Adopt (a|your first) probe/ }), editable);

		await page.goto('/probes');
		await expectEditable(page.getByRole('button', { name: 'Adopt a probe' }), editable);
		await expectEditable(page.getByRole('button', { name: 'Start a probe' }).first(), editable);

		if (!editable) {
			await page.getByRole('button', { name: 'Adopt a probe' }).locator('..').hover();
			await expect(page.getByText(ADMIN_ONLY_HINT)).toBeVisible();
		}

		await page.context().close();
	}
});

test('probe controls are editable by an org admin, and read-only with a hint for members and viewers', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe', nodeVersion: 'v18.0.0' });

	for (const [ user, editable ] of [ [ org.admin, true ], [ org.member, false ], [ org.viewer, false ] ] as const) {
		const page = await actAsOrg(browser, org, user);
		await page.goto(`/probes/${probeId}`);

		const deleteButton = page.getByRole('button', { name: 'Delete probe' });
		await expectEditable(deleteButton, editable);
		await expect(page.getByText('Your probe container is running an outdated software')).toHaveCount(editable ? 1 : 0);
		await expectEditable(page.getByRole('button', { name: 'Restart probe' }), editable);
		await expectEditable(page.getByRole('button', { name: 'Open add tags dialog' }), editable);

		await page.getByRole('button', { name: 'Edit probe name' }).click();
		await expect(page.getByLabel('Probe name input')).toHaveCount(editable ? 1 : 0);
		await page.keyboard.press('Escape');

		if (!editable) {
			await deleteButton.locator('..').hover();
			await expect(page.getByText(ADMIN_ONLY_HINT)).toBeVisible();
		}

		await page.getByRole('tab', { name: 'Settings' }).click();
		await expectEditable(page.getByLabel('Metered connection'), editable);

		await page.context().close();
	}
});

const personalAdoptionToken = async (user: User) => (await sql('directus_users').where({ id: user.id }).first('adoption_token')).adoption_token as string;

test('start commands embed the adoption token of the account the probe is adopted into', async ({ browser, org }) => {
	await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });
	await addProbe({ account_id: org.admin.account_id, userId: org.admin.id, name: 'e2e-personal-probe' });

	for (const [ page, probeName, token, message ] of [
		[ await actAsOrg(browser, org, org.admin), 'e2e-org-probe', org.adoption_token, 'includes your secret adoption token' ],
		[ await pageAs(browser, org.admin.email, 'user'), 'e2e-personal-probe', await personalAdoptionToken(org.admin), 'includes your secret adoption token' ],
	] as const) {
		await page.goto('/probes');
		await expect(page.getByText(probeName).first()).toBeVisible();
		await page.getByRole('button', { name: 'Start a probe' }).first().click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText(message);
		await expect(dialog).toContainText(`GP_ADOPTION_TOKEN=${token}`);

		await page.context().close();
	}
});

test('an org admin updating an outdated org probe gets the org adoption token', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe', nodeVersion: 'v18.0.0' });

	const page = await actAsOrg(browser, org, org.admin);
	await page.goto(`/probes/${probeId}`);
	await page.getByRole('link', { name: 'our guide' }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('includes your secret adoption token');
	await expect(dialog).toContainText(`GP_ADOPTION_TOKEN=${org.adoption_token}`);
});

test('an org probe is tagged by the org name only', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });

	const page = await actAsOrg(browser, org, org.admin);
	await page.goto(`/probes/${probeId}`);
	await page.getByRole('button', { name: 'Open add tags dialog' }).click();
	await page.locator('#editTagsPopover').getByRole('combobox').click();

	await expect(page.getByRole('option')).toHaveText([ `u-${org.name}` ]);
});

test('the role badge explains what each role can do', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.viewer);
	await page.goto('/');

	await page.getByText('Viewer', { exact: true }).hover();
	await expect(page.getByText('(your role)')).toBeVisible();
	await expect(page.getByText(/Read-only: sees the organization's probes and credits/)).toBeVisible();
	await expect(page.getByText(/Manages the organization/)).toBeVisible();
});

test('making the probes public writes the org setting, and only an org admin can do it', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });

	for (const [ user, editable ] of [ [ org.member, false ], [ org.admin, true ] ] as const) {
		const page = await actAsOrg(browser, org, user);
		await page.goto(`/probes/${probeId}`);
		await page.getByRole('button', { name: 'Target this location in a measurement' }).click();

		const tagButton = page.getByRole('button', { name: 'Tag all my probes and proceed' });
		await expectEditable(tagButton, editable);

		if (editable) {
			await tagButton.click();
			await expect.poll(async () => (await sql('gp_orgs').where({ id: org.id }).first('public_probes')).public_probes).toBe(1);
		}

		await page.context().close();
	}
});
