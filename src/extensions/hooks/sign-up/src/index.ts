import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter, action }) => {
	filter('users.create', (user, collection, database) => {
		if (user.provider === 'github') {
			handleGithubLogin(user);
		}
	});

    filter('users.update', (user) => {
        user.last_page = '/content'; // Fixes issue of `Empty .update() call detected!` during second github login.
    });
});

const handleGithubLogin = (user) => {
	const firstName = user.first_name;
	const username = user.external_identifier;

	if (!firstName) {
		user.first_name = username;
		return;
	}

	const names = firstName.split(' ');
	if (names.length > 1) {
		user.first_name = names[0];
		user.last_name = names.slice(1).join(' ');
	}
};
