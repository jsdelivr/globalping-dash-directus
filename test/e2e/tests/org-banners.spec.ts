import type { Browser } from '@playwright/test';
import axios, { type AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import type { Org } from '../types.ts';
import { png } from '../utils.ts';

const BANNERS_FOLDER_ID = '5f0b6a52-3c1e-4b8e-9d6a-1c2f7e4a9b30';

const anonymous = axios.create({ baseURL: process.env.DIRECTUS_URL, validateStatus: () => true });

const upload = (api: AxiosInstance, org: Org, body: Buffer, type = 'image/png') => {
	return api.post(`/organizations/${org.id}/banner`, body, { headers: { 'Content-Type': type } });
};

const bannerOf = async (org: Org) => (await sql('gp_orgs').where({ id: org.id }).first('banner')).banner as string | null;

const fileExists = async (id: string) => !!await sql('directus_files').where({ id }).first('id');

// The size the browser decodes the image to, loaded by the signed-in test user.
const imageSize = async (browser: Browser, url: string) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${process.env.DIRECTUS_URL}/server/ping`);

	const size = await page.evaluate(async (src) => {
		const image = new Image();
		image.src = src;
		await image.decode();
		return { width: image.naturalWidth, height: image.naturalHeight };
	}, url);

	await context.close();
	return size;
};

test('the public list has the orgs with public probes and a profile, and a single org is found by any case of its name', async ({ org, org2, actors }) => {
	await sql('gp_orgs').where({ id: org.id }).update({ public_probes: true, website: 'https://example.com' });
	await sql('gp_orgs').where({ id: org2.id }).update({ public_probes: true, website: '', description: '' });

	const names = async () => (await anonymous.get('/organizations')).data.map((item: { name: string }) => item.name);

	const list = await anonymous.get('/organizations');
	expect(list.status).toBe(200);
	expect(list.data).toContainEqual({ name: org.name, website: 'https://example.com', description: null, bannerId: null });
	expect(await names()).not.toContain(org2.name);

	// A banner alone is a profile.
	expect((await upload(actors.otherOrgAdmin, org2, png(1224, 200))).status).toBe(200);
	expect(await names()).toContain(org2.name);

	// An org with private probes is not listed whatever its profile.
	await sql('gp_orgs').where({ id: org2.id }).update({ public_probes: false, description: 'Hidden' });
	expect(await names()).not.toContain(org2.name);

	const single = await anonymous.get(`/organizations/${org.name.toUpperCase()}`);
	expect(single.status).toBe(200);
	expect(single.data).toEqual({ name: org.name, website: 'https://example.com', description: null, bannerId: null });

	expect((await anonymous.get(`/organizations/${org2.name}`)).status).toBe(404);
	expect((await anonymous.get('/organizations/e2e-org-missing')).status).toBe(404);
});

test('only the admins of the org change the banner', async ({ org, actors }) => {
	for (const api of [ actors.member, actors.otherOrgAdmin ]) {
		expect((await upload(api, org, png(1224, 200))).status).toBe(403);
	}

	expect((await actors.member.delete(`/organizations/${org.id}/banner`)).status).toBe(403);

	expect((await upload(anonymous, org, png(1224, 200))).status).toBe(400);
	expect((await upload(actors.directusAdmin, org, png(1224, 200))).status).toBe(200);
});

test('an org admin cannot change the banner or its file through the Directus API', async ({ org, actors }) => {
	const bannerId = (await upload(actors.admin, org, png(1224, 200))).data.bannerId;
	const form = new FormData();
	form.append('folder', BANNERS_FOLDER_ID);
	form.append('file', new Blob([ png(1224, 200) ], { type: 'image/png' }), 'banner.png');

	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { banner: null })).status).toBe(403);
	expect((await actors.admin.post('/files', form)).status).toBe(403);
	expect((await actors.admin.patch(`/files/${bannerId}`, { folder: null })).status).toBe(403);
	expect((await actors.admin.delete(`/files/${bannerId}`)).status).toBe(403);

	expect(await bannerOf(org)).toBe(bannerId);
	expect(await fileExists(bannerId)).toBe(true);
});

test('a banner that is not a PNG, JPEG or WebP image, or of the wrong size, is rejected', async ({ org, actors }) => {
	const bannerFiles = () => sql('directus_files').where({ folder: BANNERS_FOLDER_ID }).count({ count: '*' }).first();
	const before = await bannerFiles();
	const rejected = async (body: Buffer, status: number, message: string) => {
		const response = await upload(actors.admin, org, body);
		expect(response.status).toBe(status);
		expect(response.data).toBe(message);
	};

	await rejected(png(6001, 200), 400, 'The banner must be at most 6000×6000 px.');
	await rejected(png(1224, 200).subarray(0, 100), 400, 'The banner must be a PNG, JPEG or WebP image.');
	await rejected(Buffer.alloc(5 * 1024 * 1024 + 1), 413, 'The banner must be 5 MB or smaller.');

	expect(await bannerOf(org)).toBe(null);
	expect(await bannerFiles()).toEqual(before);
});

test('an uploaded banner is served to anyone through the banner preset only', async ({ browser, org, actors }) => {
	// The format comes from the bytes, the header is ignored.
	const uploaded = await upload(actors.admin, org, png(2448, 600), 'image/jpeg');
	expect(uploaded.status).toBe(200);

	const { bannerId } = uploaded.data;
	expect(await bannerOf(org)).toBe(bannerId);

	expect(await sql('directus_files').where({ id: bannerId }).first('folder', 'type', 'filename_download', 'width', 'height')).toEqual({
		folder: BANNERS_FOLDER_ID,
		type: 'image/png',
		filename_download: 'banner.png',
		width: 2448,
		height: 600,
	});

	const asset = await anonymous.get(`/assets/${bannerId}`, { params: { key: 'banner' } });
	expect(asset.status).toBe(200);
	expect(asset.headers['content-type']).toBe('image/webp');
	expect(await imageSize(browser, `${process.env.DIRECTUS_URL}/assets/${bannerId}?key=banner`)).toEqual({ width: 1224, height: 200 });

	// A listing of the files shows the banner ids only, nothing that names the org.
	for (const api of [ anonymous, actors.outsider ]) {
		const files = await api.get('/files', { params: { fields: '*' } });
		expect(files.status).toBe(200);
		expect(files.data.data).toContainEqual({ id: bannerId });
		files.data.data.forEach((file: object) => expect(Object.keys(file)).toEqual([ 'id' ]));
	}

	expect((await anonymous.get(`/assets/${bannerId}`, { params: { width: 10 } })).status).toBe(400);
	expect((await actors.admin.get(`/assets/${bannerId}`, { params: { width: 10 } })).status).toBe(400);
});

test('a file outside the banners folder is not readable by anonymous visitors or users', async ({ actors }) => {
	const form = new FormData();
	form.append('file', new Blob([ png(1224, 200) ], { type: 'image/png' }), 'private.png');
	const file = await actors.directusAdmin.post('/files', form);
	expect(file.status).toBe(200);

	try {
		expect((await anonymous.get(`/assets/${file.data.data.id}`, { params: { key: 'banner' } })).status).toBe(403);
		expect((await anonymous.get(`/files/${file.data.data.id}`)).status).toBe(403);
		expect((await actors.outsider.get(`/assets/${file.data.data.id}`, { params: { key: 'banner' } })).status).toBe(403);
	} finally {
		await actors.directusAdmin.delete(`/files/${file.data.data.id}`);
	}
});

test('replacing or removing the banner deletes its file', async ({ org, actors }) => {
	const first = (await upload(actors.admin, org, png(1224, 200))).data.bannerId;
	const second = (await upload(actors.admin, org, png(1300, 300))).data.bannerId;

	expect(await fileExists(first)).toBe(false);
	expect((await anonymous.get(`/assets/${first}`, { params: { key: 'banner' } })).status).toBe(403);

	expect((await actors.admin.delete(`/organizations/${org.id}/banner`)).status).toBe(200);
	expect(await fileExists(second)).toBe(false);
});

test('deleting an org deletes its banner, a refused delete does not', async ({ org, actors }) => {
	const { bannerId } = (await upload(actors.admin, org, png(1224, 200))).data;

	// A refused delete leaves the banner alone.
	for (const api of [ actors.member, anonymous ]) {
		expect((await api.delete(`/items/gp_orgs/${org.id}`)).status).toBe(403);
	}

	expect(await fileExists(bannerId)).toBe(true);
	expect(await bannerOf(org)).toBe(bannerId);

	expect((await actors.directusAdmin.delete(`/items/gp_orgs/${org.id}`)).status).toBe(204);
	await expect.poll(() => fileExists(bannerId)).toBe(false);
});
