import type { AxiosInstance } from 'axios';

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
	adoption_token: string;
	default_prefix: string;
	account_id: string;
};

export type Actors = {
	admin: AxiosInstance;
	member: AxiosInstance;
	viewer: AxiosInstance;
	outsider: AxiosInstance;
	otherOrgAdmin: AxiosInstance;
	directusAdmin: AxiosInstance;
};

export type Org = {
	id: string;
	name: string;
	github_id: string;
	adoption_token: string;
	account_id: string;
	admin: User;
	member: User;
	viewer: User;
};
