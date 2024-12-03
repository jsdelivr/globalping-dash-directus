import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';

const getCommonFields = (userId: string) => ({
	id: randomUUID(),
	asn: 16019,
	city: 'Prague',
	country: 'CZ',
	countryOfCustomCity: null,
	date_created: '2024-02-22 11:02:12',
	date_updated: null,
	isCustomCity: 0,
	lastSyncDate: new Date(),
	latitude: 50.0736,
	longitude: 14.4185,
	name: 'e2e-credits-adopted-probe',
	network: 'Vodafone Czech Republic a.s.',
	systemTags: JSON.stringify([ 'eyeball-network' ]),
	onlineTimesToday: 20,
	state: null,
	status: 'offline',
	tags: '[]',
	userId,
	uuid: randomUUID(),
	version: '0.28.0',
	hardwareDevice: null,

});

const addData = async (user: User) => {
	await sql('gp_adopted_probes').insert({
		...getCommonFields(user.id),
		ip: '1.0.0.1',
		altIps: JSON.stringify([ '1.0.0.2' ]),
	});
};

test('Adding/updating adoption with primary IP also specified in alt IPs should fail', async ({ user }) => {
	await addData(user);

	// Adding
	const err = await sql('gp_adopted_probes').insert({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '2.0.0.1' ]),
	}).catch(err => err);

	expect(err.sqlMessage).toEqual('Specified primary IP 2.0.0.1 is also specified in the alt IPs. Operation not allowed.');
	expect(err.errno).toEqual(5001);

	// Updating
	await sql('gp_adopted_probes').insert({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '2.0.0.2' ]),
	});

	const err2 = await sql('gp_adopted_probes').where({ ip: '2.0.0.1' }).update({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '2.0.0.1' ]),
	}).catch(err => err);

	expect(err2.sqlMessage).toEqual('Specified primary IP 2.0.0.1 is also specified in the alt IPs. Operation not allowed.');
	expect(err2.errno).toEqual(5001);
});

test('Adding/updating adoption with primary IP as an existing alt IP should fail', async ({ user }) => {
	await addData(user);

	// Adding
	const err = await sql('gp_adopted_probes').insert({
		...getCommonFields(user.id),
		ip: '1.0.0.2',
		altIps: JSON.stringify([ '2.0.0.2' ]),
	}).catch(err => err);

	expect(err.sqlMessage).toEqual('Specified primary IP 1.0.0.2 already exists in the alt IPs of another row. Operation not allowed.');
	expect(err.errno).toEqual(5002);

	// Updating
	await sql('gp_adopted_probes').insert({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '2.0.0.2' ]),
	});

	const err2 = await sql('gp_adopted_probes').where({ ip: '2.0.0.1' }).update({
		...getCommonFields(user.id),
		ip: '1.0.0.2',
		altIps: JSON.stringify([ '2.0.0.2' ]),
	}).catch(err => err);

	expect(err2.sqlMessage).toEqual('Specified primary IP 1.0.0.2 already exists in the alt IPs of another row. Operation not allowed.');
	expect(err2.errno).toEqual(5002);
});

test('Adding/updating adoption with altIp as an existing primary IP should fail', async ({ user }) => {
	await addData(user);

	// Adding
	const err = await sql('gp_adopted_probes').insert({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '1.0.0.1' ]),
	}).catch(err => err);

	expect(err.sqlMessage).toEqual('Alt IP 1.0.0.1 is already an IP of another row. Operation not allowed.');
	expect(err.errno).toEqual(5003);

	// Updating
	await sql('gp_adopted_probes').insert({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '2.0.0.2' ]),
	});

	const err2 = await sql('gp_adopted_probes').where({ ip: '2.0.0.1' }).update({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '1.0.0.1' ]),
	}).catch(err => err);

	expect(err2.sqlMessage).toEqual('Alt IP 1.0.0.1 is already an IP of another row. Operation not allowed.');
	expect(err2.errno).toEqual(5003);
});

test('Adding/updating adoption with altIp as an existing alt IP should fail', async ({ user }) => {
	await addData(user);

	// Adding
	const err = await sql('gp_adopted_probes').insert({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '1.0.0.2' ]),
	}).catch(err => err);

	expect(err.sqlMessage).toEqual('Alt IP 1.0.0.2 is already exists in the altIps of another row. Operation not allowed.');
	expect(err.errno).toEqual(5004);

	// Updating
	await sql('gp_adopted_probes').insert({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '2.0.0.2' ]),
	});

	const err2 = await sql('gp_adopted_probes').where({ ip: '2.0.0.1' }).update({
		...getCommonFields(user.id),
		ip: '2.0.0.1',
		altIps: JSON.stringify([ '1.0.0.2' ]),
	}).catch(err => err);

	expect(err2.sqlMessage).toEqual('Alt IP 1.0.0.2 is already exists in the altIps of another row. Operation not allowed.');
	expect(err2.errno).toEqual(5004);
});
