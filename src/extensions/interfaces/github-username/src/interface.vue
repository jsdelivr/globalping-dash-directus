<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk';

const api = useApi();

const props = withDefaults(
	defineProps<{
		value: string | number | null;
		primaryKey: string;
		type?: string;
		disabled?: boolean;
		font?: 'sans-serif' | 'serif' | 'monospace';
	}>(),
	{
		type: 'text',
		font: 'sans-serif',
	},
);

async function sync () {
	try {
		await api.post('/sync-github-username', {
			userId: props.primaryKey,
		});

		window.location.reload();
	} catch (err: any) {
		console.error(err);
		alert(err.response?.data || err.toString());
	}
}

defineEmits([ 'input' ]);
</script>

<template>
	<v-input
		:model-value="value"
		:disabled="disabled"
		:type="'text'"
		:class="font"
		@update:model-value="$emit('input', $event)"
	/>
	<v-button secondary @click="sync">Sync GitHub Username</v-button>
</template>

<style lang="scss" scoped>
.v-input {
	&.monospace {
		--v-input-font-family: var(--theme--font-family-monospace);
	}

	&.serif {
		--v-input-font-family: var(--theme--font-family-serif);
	}

	&.sans-serif {
		--v-input-font-family: var(--theme--font-family-sans-serif);
	}
}

.v-button {
	margin-top: 15px;
}
</style>
