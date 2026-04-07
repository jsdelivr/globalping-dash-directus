import jwt from 'jsonwebtoken';

type Context = {
	env: Record<string, string>;
};

export class EmailGenerator {
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
			data: this.createToken({ userId }),
		});
		return `${this.getNormalizedDirectusUrl()}/email-unsubscribe/list-unsubscribe?${query.toString()}`;
	}

	public generateTypeUnsubscribeLink (userId: string, type: string): string {
		const query = new URLSearchParams({
			data: this.createToken({ userId, type }),
		});
		return `${this.getNormalizedDirectusUrl()}/email-unsubscribe/type-unsubscribe?${query.toString()}`;
	}

	public generateSettingsLink (): string {
		return `${this.getNormalizedDashUrl()}/settings`;
	}

	public verifyToken<T extends Record<string, string>> (data: string): T | null {
		try {
			const payload = jwt.verify(data, this.context.env.SECRET!);

			if (!payload || typeof payload !== 'object') {
				return null;
			}

			return payload as T;
		} catch {
			return null;
		}
	}

	private createToken (payload: Record<string, unknown>): string {
		return jwt.sign(payload, this.context.env.SECRET!);
	}

	private getNormalizedDashUrl () {
		return this.context.env.DASH_URL!.replace(/\/+$/, '');
	}

	private getNormalizedDirectusUrl () {
		return this.context.env.PUBLIC_URL!.replace(/\/+$/, '');
	}
}

let emailGenerator: EmailGenerator | null = null;

export const getEmailGenerator = (context: Context): EmailGenerator => {
	if (!emailGenerator) {
		emailGenerator = new EmailGenerator(context);
	}

	return emailGenerator;
};
