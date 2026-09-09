export type AdoptedProbe = {
	id: string;
	account_id: string;
	name: string | null;
	ip: string | null;
	status: string;
	lastSyncDate: Date;
	originalLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	systemTags: string[];
};
