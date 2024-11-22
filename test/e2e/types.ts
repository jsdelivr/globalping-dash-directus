export type User = {
	id: string;
	external_identifier: string;
	email: string;
	role: string;
	first_name: string;
	last_name: string;
	password: string;
	provider: string;
	email_notifications: number;
	github_organizations: string;
	github_username: string;
	user_type: string;
};
