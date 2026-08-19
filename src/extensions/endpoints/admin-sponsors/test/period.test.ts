import { expect } from 'chai';
import { resolveSponsorsPeriod } from '../src/period.js';

describe('resolveSponsorsPeriod', () => {
	const now = new Date('2026-08-13T12:00:00.000Z');

	it('resolves the exact rolling past-year interval and intersecting UTC months', () => {
		expect(resolveSponsorsPeriod('past-year', now)).to.deep.equal({
			from: new Date('2025-08-13T12:00:00.000Z'),
			to: new Date('2026-08-13T12:00:00.000Z'),
			monthKeys: [
				'2025-08',
				'2025-09',
				'2025-10',
				'2025-11',
				'2025-12',
				'2026-01',
				'2026-02',
				'2026-03',
				'2026-04',
				'2026-05',
				'2026-06',
				'2026-07',
				'2026-08',
			],
		});
	});

	it('resolves a calendar year to UTC boundaries and twelve month keys', () => {
		expect(resolveSponsorsPeriod('2025', now)).to.deep.equal({
			from: new Date('2025-01-01T00:00:00.000Z'),
			to: new Date('2026-01-01T00:00:00.000Z'),
			monthKeys: [
				'2025-01',
				'2025-02',
				'2025-03',
				'2025-04',
				'2025-05',
				'2025-06',
				'2025-07',
				'2025-08',
				'2025-09',
				'2025-10',
				'2025-11',
				'2025-12',
			],
		});
	});

	for (const invalidPeriod of [ '2023', '2027', '2026-07', 'all-time' ]) {
		it(`rejects invalid period ${invalidPeriod}`, () => {
			expect(() => resolveSponsorsPeriod(invalidPeriod, now)).to.throw('Invalid sponsors period.');
		});
	}
});
