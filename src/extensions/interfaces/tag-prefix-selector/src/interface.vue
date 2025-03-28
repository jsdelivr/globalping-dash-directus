<script setup lang="ts">
	import { ref, watch } from 'vue';
	import { useApi } from '@directus/extensions-sdk';

	const api = useApi();

	const props = withDefaults(
		defineProps<{
			value: string | null;
			primaryKey: string;
			type: string;
			disabled?: boolean;
			font?: 'sans-serif' | 'serif' | 'monospace';
		}>(),
		{
			font: 'sans-serif',
		},
	);

	defineEmits([ 'input' ]);

	const prefixes = ref<string[]>([]);

	async function fetchUserData () {
		try {
			const userId = props.primaryKey || 'me';
			const response = await api.get(`/users/${userId}`, {
				params: {
					fields: [ 'id', 'github_username', 'github_organizations' ],
				},
			});

			const user = response.data.data;
			prefixes.value = [ user.github_username, ...user.github_organizations ];
		} catch (err: any) {
			console.error(err);
			alert(err.message || err.toString());
		}
	}

	watch(() => props.primaryKey, (newVal, oldVal) => {
		if (newVal && newVal !== oldVal) {
			fetchUserData();
		}
	}, { immediate: true });
</script>

<template>
	<div class="dropdown">
		<v-select
			:model-value="value"
			:items="prefixes.map(value => ({text: value, value}))"
			:disabled="disabled"
			:placeholder="'Select prefix'"
			@update:model-value="$emit('input', $event)"
		/>
	</div>
</template>

<style lang="scss" scoped>
.dropdown {
	flex-grow: 1;
}
</style>
