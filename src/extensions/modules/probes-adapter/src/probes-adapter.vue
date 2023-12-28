<template>
	<private-view title="Adopt Your Probes">
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded icon exact disabled>
				<v-icon name="router" />
			</v-button>
		</template>

		<div class="content">
			<p class="description">
				This page allows to adopt your own probes. Follow these steps (Note, multiple probes should be adopted one by one):<br>
				1. Enter the IP address of your probe;<br>
				2. Go to the probe logs and find a 6 digit adoption code;<br>
				3. Enter the code to the verification input;<br>
				4. Done. Probe can be found on the <a class="link" href="/admin/content/adopted_probes">adopted probes</a> page.
			</p>

			<form @submit.prevent="sendCode">
				<label for="ip" class="label">Enter the IP address:</label>
				<v-input
					type="text"
					id="ip"
					v-model="ip"
					class="input"
					required
				/>
				<v-button type="submit">Send code to probe</v-button>
				<v-notice class="notice" v-if="sendCodeResponse">{{ sendCodeResponse }}</v-notice>
			</form>

			<form @submit.prevent="verifyCode">
				<label for="code" class="label">Enter the adoption code:</label>
				<v-input
					type="text"
					id="code"
					v-model="code"
					class="input"
					required
				/>
				<v-button type="submit">Verify the code</v-button>
				<v-notice class="notice" v-if="verifyCodeResponse">{{ verifyCodeResponse }}</v-notice>
			</form>
		</div>
	</private-view>
</template>

<script>
import { useApi } from '@directus/extensions-sdk';

export default {
	data () {
		return {
			ip: '',
			code: '',
			sendCodeResponse: '',
			verifyCodeResponse: '',
		};
	},
	setup () {
		const api = useApi();

		return {
			api,
		};
	},
	methods: {
		async sendCode () {
			try {
				const response = await this.api.post('/adoption-code/send-code', { ip: this.ip });
				this.sendCodeResponse = response.data;
			} catch (error) {
				this.sendCodeResponse = error.response.data;
			}
		},

		async verifyCode () {
			try {
				const response = await this.api.post('/adoption-code/verify-code', { code: this.code });
				this.verifyCodeResponse = response.data;
			} catch (error) {
				this.verifyCodeResponse = error.response.data;
			}
		},
	},
	watch: {
		ip () {
			this.sendCodeResponse = '';
		},
		code () {
			this.verifyCodeResponse = '';
		},
	},
};
</script>

<style lang="scss" scoped>
.content {
	padding: var(--content-padding);
	padding-bottom: var(--content-padding-bottom);
}

.description {
	color: var(--theme--foreground-accent);
	font-size: 16px;
	margin-bottom: 16px;
}

.link {
	text-decoration: underline;
	font-weight: 600;
}

form {
	margin-bottom: 24px;
}

.notice {
	margin-top: 8px;
}

.header-icon {
	--v-button-color-disabled: var(--theme--foreground);
}

.label {
	font-weight: 600;
	color: var(--theme--foreground-accent);
	font-size: 16px;
	margin-bottom: 8px;
}

.input {
	margin-bottom: 8px;
}
</style>
