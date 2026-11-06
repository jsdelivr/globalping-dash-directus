import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import type { User } from '../types.ts';
import { getSelectedOrgs, selectOrgs } from '../github.ts';
import { actAsOrg, addProbe, pageAs } from '../utils.ts';

const ADMIN_ONLY_HINT = 'Only organization admins can do this';

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
	await addProbe({ account_id: org.admin.account_id, name: 'e2e-personal-probe' });

	for (const [ page, probeName, owner, token ] of [
		[ await actAsOrg(browser, org, org.admin), 'e2e-org-probe', org.name, org.adoption_token ],
		[ await pageAs(browser, org.admin.email, 'user'), 'e2e-personal-probe', 'your', await personalAdoptionToken(org.admin) ],
	] as const) {
		await page.goto('/probes');
		await expect(page.getByText(probeName).first()).toBeVisible();
		await page.getByRole('button', { name: 'Start a probe' }).first().click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText(`includes ${owner} secret adoption token`);
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
	await expect(dialog).toContainText(`includes ${org.name} secret adoption token`);
	await expect(dialog).toContainText(`GP_ADOPTION_TOKEN=${org.adoption_token}`);
});

test('the update guide opened from a notification embeds the token of the notified account, not of the active one', async ({ browser, org }) => {
	for (const [ page, accountId, owner, token ] of [
		[ await actAsOrg(browser, org, org.admin), org.admin.account_id, 'your', await personalAdoptionToken(org.admin) ],
		[ await pageAs(browser, org.admin.email, 'user'), org.account_id, org.name, org.adoption_token ],
	] as const) {
		await page.goto(`/probes?view=update-a-probe&account=${accountId}`);

		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText(`includes ${owner} secret adoption token`);
		await expect(dialog).toContainText(`GP_ADOPTION_TOKEN=${token}`);

		await page.context().close();
	}
});

test('a new tag of an org probe gets the org name as its prefix, and a saved tag can switch to it', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe', tags: JSON.stringify([{ prefix: org.admin.github_username, value: 'legacy-tag' }]) });

	const page = await actAsOrg(browser, org, org.admin);
	await page.goto(`/probes/${probeId}`);
	await page.getByRole('button', { name: 'Open edit tags dialog' }).click();

	const popover = page.locator('#editTagsPopover');
	const prefixes = popover.getByLabel('Tag prefix');
	await popover.getByRole('button', { name: 'Add tag' }).click();

	await expect(prefixes).toHaveText([ `u-${org.admin.github_username}`, `u-${org.name}` ]);

	await popover.getByRole('combobox').click();
	await page.getByRole('option', { name: `u-${org.name}` }).click();

	await expect(prefixes).toHaveText([ `u-${org.name}`, `u-${org.name}` ]);
});

test('a personal probe gives new and edited tags the GitHub username prefix, and keeps the prefix of an unchanged one', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.admin.account_id, name: 'e2e-personal-probe', tags: JSON.stringify([{ prefix: org.name, value: 'legacy-tag' }]) });

	const page = await pageAs(browser, org.admin.email, 'user');
	await page.goto(`/probes/${probeId}`);
	await page.getByRole('button', { name: 'Open edit tags dialog' }).click();

	const popover = page.locator('#editTagsPopover');
	const prefixes = popover.getByLabel('Tag prefix');
	const warning = popover.getByText('Edited tags will get the');
	await popover.getByRole('button', { name: 'Add tag' }).click();

	await expect(prefixes).toHaveText([ `u-${org.name}`, `u-${org.admin.github_username}` ]);
	await expect(warning).toBeHidden();

	await popover.getByLabel('Your tag').first().fill('edited-tag');

	await expect(prefixes).toHaveText([ `u-${org.admin.github_username}`, `u-${org.admin.github_username}` ]);
	await expect(warning).toContainText(`Edited tags will get the u-${org.admin.github_username} prefix after saving.`);
});

test('making the probes public writes the org setting, and only an org admin can do it', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });

	for (const [ user, editable ] of [ [ org.member, false ], [ org.admin, true ] ] as const) {
		const page = await actAsOrg(browser, org, user);
		await page.goto(`/probes/${probeId}`);
		await page.getByRole('button', { name: 'Target this location in a measurement' }).click();

		const tagButton = page.getByRole('button', { name: 'Tag all probes and proceed' });
		await expectEditable(tagButton, editable);

		if (editable) {
			await tagButton.click();
			await expect.poll(async () => (await sql('gp_orgs').where({ id: org.id }).first('public_probes')).public_probes).toBe(1);
		}

		await page.context().close();
	}
});

test('a link to a probe of a selected org switches the account to that org', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });

	const page = await pageAs(browser, org.admin.email, 'user');
	await page.goto(`/probes/${probeId}`);

	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expectEditable(page.getByRole('button', { name: 'Delete probe' }), true);
});

test('a link to a probe of a non-selected org is read-only until the org is added and switched to', async ({ browser, org }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });
	await selectOrgs(org.admin, []);

	const page = await pageAs(browser, org.admin.email, 'user');
	await page.goto(`/probes/${probeId}`);

	await expect(page.getByText(`This probe belongs to the organization ${org.name}`)).toBeVisible();
	await expectEditable(page.getByRole('button', { name: 'Delete probe' }), false);
	await expect(page.getByLabel('Profile')).not.toContainText(org.name);

	await page.getByRole('button', { name: 'Add and switch' }).click();

	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expectEditable(page.getByRole('button', { name: 'Delete probe' }), true);
	expect(await getSelectedOrgs(org.admin)).toEqual([ org.id ]);
});
