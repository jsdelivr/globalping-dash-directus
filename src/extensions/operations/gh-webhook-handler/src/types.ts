export type Data = {
	$trigger: {
		headers: {
			'x-hub-signature-256'?: string;
		},
		body: {
			action?: 'created' | 'tier_changed',
			sponsorship: {
				sponsor?: {
					login: string;
					id: number;
				},
				tier: {
					created_at: string;
					monthly_price_in_dollars: number;
					is_one_time: boolean;
				}
			},
			changes?: {
				tier: {
					from: {
						monthly_price_in_dollars: number;
					}
				}
			},
		}
	}
};
