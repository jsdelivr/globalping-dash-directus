export type AdoptedProbe = {
	id: string;
	userId: string;
	name: string | null;
	ip: string;
	status: string;
	lastSyncDate: Date;
	originalLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
};
