import jwt from 'jsonwebtoken';

type Context = {
	env: Record<string, string>;
};

type Audience = 'email-unsubscribe' | 'username-change';

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
			data: this.createToken({ userId }, 'email-unsubscribe'),
		});
		return `${this.getNormalizedDirectusUrl()}/email-unsubscribe/unsubscribe?${query.toString()}`;
	}

	public generateTypeUnsubscribeLink (userId: string, type: string): string {
		const query = new URLSearchParams({
			data: this.createToken({ userId, type }, 'email-unsubscribe'),
		});
		return `${this.getNormalizedDashUrl()}/emails/unsubscribe?${query.toString()}`;
	}

	public generateSettingsLink (): string {
		return `${this.getNormalizedDashUrl()}/settings`;
	}

	public generateUsernameChangeLink (userId: string): string {
		const query = new URLSearchParams({
			data: this.createToken({ userId }, 'username-change'),
		});
		return `${this.getNormalizedDashUrl()}/username-change?${query.toString()}`;
	}

	// TODO: `allowLegacyNoAudience` is only for legacy no-aud tokens, so previous email links still work. Should be removed after 01.07.2026.
	public verifyToken (data: string, audience: string, allowLegacyNoAudience = false): { userId: string; type?: string } | null {
		try {
			const payload = jwt.verify(data, this.context.env.SECRET!, allowLegacyNoAudience ? {} : { audience }) as { userId: string; type?: string; aud?: string };

			if (!payload || typeof payload !== 'object') {
				return null;
			}

			if (allowLegacyNoAudience && payload.aud !== undefined && payload.aud !== audience) {
				return null;
			}

			return payload;
		} catch {
			return null;
		}
	}

	private createToken (payload: Record<string, unknown>, audience: Audience): string {
		return jwt.sign(payload, this.context.env.SECRET!, { audience });
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
