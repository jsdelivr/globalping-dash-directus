- rewrite
	const account = await database('gp_accounts as a')
		.leftJoin('gp_org_members as m', function () {
			this.on('m.org', 'a.org').andOnVal('m.user', '=', accountability?.user ?? null);
		})
		.where('a.id', token.account_id)
		.where((query) => {
			query.where('a.user', accountability?.user ?? null).orWhereIn('m.role', [ 'admin', 'member' ]);
		})
		.first('a.id');
