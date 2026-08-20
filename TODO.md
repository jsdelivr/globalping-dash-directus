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

- Low credits notification fires right after the very first credits are granted (not org-related, pre-existing):
  a new user has no `gp_credits` row at all (sign-up only creates one when there are unconsumed sponsorship additions).
  After adopting a probe the daily probe-credits cron grants 150 credits, the trigger creates the row, and the next
  low-credits run (every 5 min) sees 150 <= 5000 and notifies "your credits are running low" - right after the user
  received their first credits ever. Options: skip when the balance just grew, or when the row was created recently.
