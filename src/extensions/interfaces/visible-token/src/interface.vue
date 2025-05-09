<template>
	<div class="system-token">
		<v-input
			:model-value="value"
			:type="text"
			:placeholder="placeholder"
			:disabled="disabled"
			readonly
			:class="{ saved: value && !localValue }"
			@update:model-value="emitValue"
		>
			<template #append>
				<v-icon
					v-if="!disabled"
					v-tooltip="value ? t('interfaces.system-token.regenerate') : t('interfaces.system-token.generate')"
					:name="value ? 'refresh' : 'add'"
					class="regenerate-icon"
					clickable
					:disabled="disabled || loading"
					@click="generateToken"
				/>
				<v-icon
					v-tooltip="!disabled && value && t('interfaces.system-token.remove_token')"
					:name="!disabled && value ? 'clear' : 'vpn_key'"
					:class="{ 'clear-icon': !disabled && !!value, 'default-icon': disabled && value }"
					:clickable="!disabled && !!value"
					:disabled="loading || !value"
					@click="emitValue(null)"
				/>
			</template>
		</v-input>

		<v-notice v-if="isNewTokenGenerated && value" type="info">
			{{ `New token value generated. You can always get back here to view it's value again.` }}
		</v-notice>
	</div>
</template>

<script lang="ts" setup>
	import { computed, ref, watch } from 'vue';
	import { useI18n } from 'vue-i18n';
	import { useApi } from '@directus/extensions-sdk';

	interface Props {
		value?: string | null;
		disabled?: boolean;
	}

	const api = useApi();

	const props = withDefaults(defineProps<Props>(), { value: () => null!, disabled: false });

	const emit = defineEmits([ 'input' ]);

	const { t } = useI18n();

	const placeholder = computed(() => {
		if (props.disabled && !props.value) { return null; }

		return t('interfaces.system-token.placeholder');
	});

	const localValue = ref<string | null>(null);
	const loading = ref(false);
	const isNewTokenGenerated = ref(false);
	const regexp = new RegExp('^[*]+$');

	watch(
		() => props.value,
		(newValue) => {
			if (!newValue) {
				localValue.value = null;
				return;
			}

			if (newValue && regexp.test(newValue)) {
				localValue.value = null;
				isNewTokenGenerated.value = false;
			}
		},
		{ immediate: true },
	);

	async function generateToken () {
		loading.value = true;

		try {
			const response = await api.post('/bytes');
			emitValue(response.data.data);
			isNewTokenGenerated.value = true;
		} catch (err: any) {
			console.error(err);
			alert('Unexpected error occured, please contact the administrator');
		} finally {
			loading.value = false;
		}
	}

	function emitValue (newValue: string | null) {
		emit('input', newValue);
		localValue.value = newValue;
	}
</script>

<style lang="scss" scoped>
.v-input {
	--v-input-font-family: var(--family-monospace);
}

.saved {
	--v-input-placeholder-color: var(--theme-primary);
}

.v-notice {
	margin-top: 12px;
}

.regenerate-icon {
	margin-right: 4px;
}

.clear-icon {
	--v-icon-color-hover: var(--danger);
}

.default-icon {
	--v-icon-color: var(--theme-primary);
}
</style>
