import { defineHook } from '@directus/extensions-sdk';

type User = {
    provider: string;
    external_identifier: string;
    first_name?: string;
    last_name?: string;
    last_page?: string;
}

export default defineHook(({ filter }) => {
	filter('users.create', (payload) => {
		const user = payload as User;

		if (user.provider === 'github') {
			handleGithubLogin(user);
		}
	});
});

const handleGithubLogin = (user: User) => {
	const firstName = user.first_name;
	const id = user.external_identifier;

	if (!firstName) {
		user.first_name = id;
		return;
	}

	const names = firstName.split(' ');

	if (names.length > 1) {
		user.first_name = names[0];
		user.last_name = names.slice(1).join(' ');
	}
};
