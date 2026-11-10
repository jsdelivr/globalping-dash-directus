import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { actAsOrg, pageAs, png } from '../utils.ts';
import { getMemberships, membership, prepareMockGithub, sync } from '../github.ts';

const orgRow = (orgId: string) => sql('gp_orgs').where({ id: orgId }).first('adoption_token', 'public_probes', 'extra_adoption_tokens', 'default_role');
const roleOf = async (orgId: string, userId: string) => (await sql('gp_org_members').where({ org: orgId, user: userId }).first('role')).role as string;

test('the Organization screen explains what each role can do', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/settings?tab=organization');

	const trigger = page.getByRole('columnheader', { name: 'Role' }).getByLabel('Organization roles');
	await trigger.hover();
	const tooltip = page.getByRole('tooltip');
	await expect(tooltip).toContainText('Manages the organization\'s settings, adoption token, members, and their roles.');
	await expect(tooltip).toContainText('Can\'t adopt or edit probes.');
	await expect(tooltip).toContainText('Can\'t create tokens or run measurements on globalping.io as the organization.');
	await page.getByRole('columnheader', { name: 'Member', exact: true }).hover();
	await expect(tooltip).toBeHidden();
});

test.afterEach(async ({ org }) => {
	await sql('gp_credits_redirects').where({ source_github_id: org.github_id }).delete();
});

test('Settings shows the organization settings to an org admin, and the personal ones to anyone else', async ({ browser, org }) => {
	for (const [ user, isAdmin ] of [ [ org.admin, true ], [ org.member, false ], [ org.viewer, false ] ] as const) {
		const page = await actAsOrg(browser, org, user);
		await page.goto('/settings?tab=organization');

		await expect(page.getByRole('heading', { name: /settings$/i, level: 1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'General' })).toHaveCount(isAdmin ? 1 : 0);
		await expect(page.getByRole('heading', { name: 'Account details' })).toHaveCount(isAdmin ? 0 : 1);
		await page.context().close();
	}

	const page = await pageAs(browser, org.admin.email, 'user');
	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'General' })).toHaveCount(0);
});

test('Settings links open the organization tab only for an active org admin, on desktop and mobile', async ({ browser, org }) => {
	for (const [ user, canManageOrg ] of [ [ org.admin, true ], [ org.member, false ], [ org.viewer, false ], [ null, false ] ] as const) {
		const page = user ? await actAsOrg(browser, org, user) : await pageAs(browser, org.admin.email, 'user');
		const settingsPath = canManageOrg ? '/settings?tab=organization' : '/settings';

		for (const mobile of [ false, true ]) {
			await page.setViewportSize({ width: mobile ? 400 : 1280, height: 900 });
			await page.goto('/');
			await page.getByLabel(mobile ? 'Menu' : 'Profile', { exact: true }).click();
			const link = mobile
				? page.locator('[data-pc-name=drawer]').getByRole('link', { name: /Settings$/ })
				: page.getByRole('menuitem', { name: 'Settings', exact: true }).locator('a');
			await expect(link).toHaveAttribute('href', settingsPath);
			await link.click();
			await expect(page).toHaveURL(new URL(settingsPath, process.env.DASH_URL!).href);
			await expect(page.getByRole('heading', { name: canManageOrg ? 'General' : 'Account details', exact: true })).toBeVisible();
		}

		await page.context().close();
	}
});

test('an org admin switches between the personal and organization settings, and unsaved changes are confirmed first', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/settings');
	const unsavedChanges = page.getByRole('dialog', { name: 'Unsaved changes' });

	await expect(page.getByRole('tab', { name: 'Personal' })).toHaveAttribute('aria-selected', 'true');
	await page.getByRole('tab', { name: 'Organization' }).click();
	await expect(page).toHaveURL(/\/settings\?tab=organization$/);

	await page.getByLabel('Website').fill('https://example.org');
	await page.getByRole('tab', { name: 'Personal' }).click();
	await unsavedChanges.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('tab', { name: 'Organization' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByLabel('Website')).toHaveValue('https://example.org');

	await page.getByRole('tab', { name: 'Personal' }).click();
	await unsavedChanges.getByRole('button', { name: 'Leave' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('heading', { name: 'Account details' })).toBeVisible();
});

test('an org admin regenerates the adoption token and makes the probes public with "Apply settings"', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/settings?tab=organization');

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
	await page.goto('/settings?tab=organization');

	await expect(page.getByText('e2e-old-member')).toBeVisible();
	await expect(page.getByText('e2eold••••0000')).toBeVisible();
	await expect(page.getByText('e2eoldtoken0000000000000000000000')).toHaveCount(0);

	await page.getByRole('listitem').filter({ hasText: 'e2e-old-member' }).getByRole('button', { name: 'Remove' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();

	await expect(page.getByRole('listitem').filter({ hasText: 'e2e-old-member' })).toHaveCount(0);
	expect(JSON.parse((await orgRow(org.id)).extra_adoption_tokens)).toEqual([{ github_username: 'e2e-other-member', token: 'e2eothertoken00000000000000000000' }]);
});

test('an org admin sees the sponsorship credit redirect of the org and removes it after confirming', async ({ browser, org }) => {
	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });

	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/settings?tab=organization');

	await expect(page.getByRole('heading', { name: 'Sponsorship credit redirects' })).toBeVisible();
	const redirect = page.getByRole('listitem').filter({ hasText: org.member.github_username });
	await expect(redirect).toContainText(org.name);

	await redirect.getByRole('button', { name: 'Remove' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();

	await expect(page.getByRole('heading', { name: 'Sponsorship credit redirects' })).toHaveCount(0);
	expect(await sql('gp_credits_redirects').where({ source_github_id: org.github_id })).toHaveLength(0);
});

test('an org admin changes roles after confirming, with a warning on demotion from admin or to viewer', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/settings?tab=organization');

	await expect(page.getByRole('row').filter({ hasText: '(you)' })).toContainText(org.admin.github_username);
	await expect(page.getByLabel(`Role of ${org.admin.github_username}`)).toHaveCount(0);

	await page.getByLabel(`Role of ${org.viewer.github_username}`).click();
	await page.getByRole('option', { name: 'Member' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Change to member' }).click();
	await expect.poll(() => roleOf(org.id, org.viewer.id)).toBe('member');

	await page.getByLabel(`Role of ${org.viewer.github_username}`).click();
	await page.getByRole('option', { name: 'Admin' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Change to admin' }).click();
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

test('an org admin sets the default role for new members after confirming, and the GitHub sync applies it', async ({ browser, org, user, user2 }) => {
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/settings?tab=organization');

	const defaultRole = page.getByLabel('Default role for new members');
	await expect(defaultRole).toContainText('Member');

	await defaultRole.click();
	await page.getByRole('option', { name: 'Viewer' }).click();
	await expect(page.getByRole('dialog')).toContainText('GitHub admins of the organization always join as admins');
	await page.getByRole('dialog').getByRole('button', { name: 'Set to viewer' }).click();
	await expect.poll(async () => (await orgRow(org.id)).default_role).toBe('viewer');
	await expect(defaultRole).toContainText('Viewer');

	await prepareMockGithub(user, [ membership(Number(org.github_id), org.name) ]);
	await sync(user);
	expect(await getMemberships(user)).toMatchObject([{ github_id: org.github_id, role: 'viewer' }]);

	await defaultRole.click();
	await page.getByRole('option', { name: 'Member' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Set to member' }).click();
	await expect.poll(async () => (await orgRow(org.id)).default_role).toBe('member');

	await prepareMockGithub(user2, [ membership(Number(org.github_id), org.name) ]);
	await sync(user2);
	expect(await getMemberships(user2)).toMatchObject([{ github_id: org.github_id, role: 'member' }]);
});

test('an org admin edits the org website and description', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/settings?tab=organization');

	await page.getByLabel('Website').fill('https://john-org');
	await page.getByLabel('Website').blur();
	await expect(page.getByText('Enter a full URL, such as https://example.com.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Apply settings' })).toBeDisabled();

	await page.getByLabel('Website').fill('https://example.org/about');
	await page.getByLabel('Description').fill('Probes everywhere.');
	await expect(page.getByText('18/200')).toBeVisible();
	await page.getByRole('button', { name: 'Apply settings' }).click();

	await expect.poll(() => sql('gp_orgs').where({ id: org.id }).first('website', 'description')).toEqual({ website: 'https://example.org/about', description: 'Probes everywhere.' });
});

test('an org admin stages a banner and it is uploaded, replaced and removed with "Apply settings"', async ({ browser, org }) => {
	const bannerOf = async () => (await sql('gp_orgs').where({ id: org.id }).first('banner')).banner as string | null;
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/settings?tab=organization');

	const preview = page.getByRole('img', { name: 'Banner preview' });
	const apply = page.getByRole('button', { name: 'Apply settings' });
	const pick = (width: number, height: number) => page.getByLabel('Banner file').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: png(width, height) });

	await expect(page.getByText('No banner')).toBeVisible();

	// A banner below the minimum size is refused before anything is sent.
	await pick(1000, 200);
	await expect(page.locator('#org-banner-error')).toHaveText('The banner must be at least 1224×200 px.');
	await expect(preview).toHaveCount(0);
	await expect(apply).toBeDisabled();

	// The picked file is only previewed until the settings are applied.
	await pick(1224, 200);
	await expect(page.locator('#org-banner-error')).toHaveText('');
	await expect(preview).toHaveAttribute('src', /^blob:/);
	await expect(page.getByText('Save your changes to apply the new banner.')).toBeVisible();
	expect(await bannerOf()).toBe(null);

	await apply.click();
	await expect(page.getByText('Organization settings saved')).toBeVisible();
	await expect.poll(bannerOf).not.toBe(null);
	const first = await bannerOf();
	await expect(preview).toHaveAttribute('src', `${process.env.DIRECTUS_URL}/assets/${first}?key=banner`);
	await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1224);
	await expect(apply).toBeDisabled();

	const [ chooser ] = await Promise.all([ page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Replace banner' }).click() ]);
	await chooser.setFiles({ name: 'banner.png', mimeType: 'image/png', buffer: png(1300, 300) });
	await expect(preview).toHaveAttribute('src', /^blob:/);
	await apply.click();
	await expect.poll(bannerOf).not.toBe(first);
	await expect(preview).toHaveAttribute('src', `${process.env.DIRECTUS_URL}/assets/${await bannerOf()}?key=banner`);
	expect(await sql('directus_files').where({ id: first }).first('id')).toBeUndefined();

	// A staged removal can be undone, and is applied only on save.
	await page.getByRole('button', { name: 'Remove banner' }).click();
	await expect(page.getByText('Save your changes to remove the banner.')).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(preview).toHaveAttribute('src', /\/assets\//);
	await expect(apply).toBeDisabled();

	await page.getByRole('button', { name: 'Remove banner' }).click();
	await expect(page.getByText('No banner')).toBeVisible();
	await expect(apply).toBeEnabled();
	expect(await bannerOf()).not.toBe(null);

	await apply.click();
	await expect.poll(bannerOf).toBe(null);
	await expect(page.getByRole('button', { name: 'Upload image' })).toBeVisible();
});
