// A row per account recipient: the account owner itself, or every admin of the org, each with their own threshold.
export type CandidateRow = {
	id: number;
	account_id: string;
	amount: number;
	recipient: string;
	allNotifiedUsers: string[];
	threshold: number;
	enabled: boolean;
};

export type NotifiedListUpdate = { id: number; recipients: string[] };
