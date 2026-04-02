import jwt from 'jsonwebtoken';

type Context = {
	env: Record<string, string>;
};

type TokenPayload = {
	userId: string;
};

export class EmailLinks {
	public constructor (private readonly context: Context) {
		if (!context.env.DASH_URL) {
			throw new Error('DASH_URL is not set.');
		}

		if (!context.env.SECRET) {
			throw new Error('SECRET is not set.');
		}
	}

	public generateListUnsubscribeLink (userId: string): string {
		const query = new URLSearchParams({
			data: this.createToken(userId),
		});
		return `${this.getNormalizedDashUrl()}/list-unsubscribe?${query.toString()}`;
	}

	public generateSettingsLink (): string {
		return `${this.getNormalizedDashUrl()}/settings`;
	}

	public verifyToken (data: string): TokenPayload | null {
		try {
			const payload = jwt.verify(data, this.context.env.SECRET!) as TokenPayload;
			return payload;
		} catch {
			return null;
		}
	}

	private createToken (userId: string): string {
		return jwt.sign({ userId }, this.context.env.SECRET!);
	}

	private getNormalizedDashUrl () {
		return this.context.env.DASH_URL!.replace(/\/+$/, '');
	}
}

let emailLinks: EmailLinks | null = null;

export const getEmailLinks = (context: Context): EmailLinks => {
	if (!emailLinks) {
		emailLinks = new EmailLinks(context);
	}

	return emailLinks;
};
