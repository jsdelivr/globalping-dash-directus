<script setup lang="ts">
	import { ref, watch, inject, computed, type Ref } from 'vue';
	import { useApi } from '@directus/extensions-sdk';

	const api = useApi();

	const props = withDefaults(
		defineProps<{
			value: { value: string; prefix: string }[] | null;
			type: string;
			disabled?: boolean;
			font?: 'sans-serif' | 'serif' | 'monospace';
		}>(),
		{
			font: 'sans-serif',
		},
	);

	const values = inject<Ref<{ account_id?: string | null }>>('values');

	const emit = defineEmits([ 'input' ]);

	const accountId = computed(() => values?.value?.account_id ?? null);
	const ownerName = ref<string | null>(null);

	const tags = ref<{ value: string; prefix: string }[]>([]);
	watch(() => props.value, (newVal) => {
		tags.value = newVal ?? [];
	}, { immediate: true });

	const getPrefixOptions = (tag: { value: string; prefix: string }) => {
		return ownerName.value && tag.prefix !== ownerName.value ? [ tag.prefix, ownerName.value ] : [];
	};

	const updatePrefix = (index: number, newPrefix: string) => {
		const updatedArray = [ ...tags.value ];
		updatedArray[index] = { ...tags.value[index], prefix: newPrefix };
		emit('input', updatedArray);
	};
	const updateTag = (index: number, newTag: string) => {
		const updatedArray = [ ...tags.value ];
		updatedArray[index] = { value: newTag, prefix: ownerName.value ?? tags.value[index].prefix };
		emit('input', updatedArray);
	};
	// A new tag always gets the name of the probe owner.
	const addTag = () => {
		const updatedArray = [ ...tags.value, { value: '', prefix: ownerName.value }];
		emit('input', updatedArray);
	};
	const deleteTag = (index: number) => {
		const updatedArray = tags.value.filter((_, i) => i !== index);
		emit('input', updatedArray);
	};

	async function fetchOwnerName (id: string) {
		try {
			const response = await api.get(`/items/gp_accounts/${id}`, {
				params: {
					fields: [ 'user.github_username', 'org.name' ],
				},
			});

			if (accountId.value !== id) { return; }

			const account = response.data.data;
			ownerName.value = account.org?.name ?? account.user?.github_username ?? null;
		} catch (err: any) {
			console.error(err);
			alert(err.message || err.toString());
		}
	}

	watch(accountId, (newVal) => {
		ownerName.value = null;

		if (newVal) {
			fetchOwnerName(newVal);
		}
	}, { immediate: true });
</script>

<template>
	<div v-for="(item, index) in tags" :key="index" class="row">
		<p class="text">u-</p>
		<div v-if="getPrefixOptions(item).length" class="prefix">
			<v-select
				:model-value="item.prefix"
				:items="getPrefixOptions(item).map(value => ({ text: value, value }))"
				:disabled="disabled"
				@update:model-value="(newPrefix) => updatePrefix(index, newPrefix)"
			/>
		</div>
		<p v-else class="text">{{ item.prefix }}</p>
		<p class="text">-</p>
		<div class="input">
			<v-input
				:model-value="item.value"
				:disabled="disabled"
				:type="'text'"
				:class="font"
				@update:model-value="(newTag) => updateTag(index, newTag)"
			/>
		</div>
		<button class="close-button" @click="() => deleteTag(index)">
			<v-icon name="close"/>
		</button>
	</div>
	<v-button secondary :disabled="disabled || !ownerName" @click="addTag">Add Tag</v-button>
</template>

<style lang="scss" scoped>
.row {
	margin-top: 15px;
	display: flex;
	flex-direction: row;
	justify-content: space-around;
}

.text {
	line-height: 60px;
	text-align: center;
	margin-right: 4px;
}

.prefix {
	flex: 0 0 200px;
	margin-right: 4px;
}

.input {
	flex-grow: 1;
}

.close-button {
	margin-left: 5px;
	width: 30px;
}

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
