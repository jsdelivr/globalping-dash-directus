<template>
	<div class="interface-tags">
		<v-input
			v-if="allowCustom"
			:model-value="localValue"
			:placeholder="placeholder || t('interfaces.tags.add_tags')"
			:disabled="disabled"
			:dir="direction"
			@keydown="onInput"
			@update:model-value="updateValue"
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
			</template>
		</v-input>
		<div v-if="presetVals.length > 0 || customVals.length > 0" class="tags">
			<span v-if="presetVals.length > 0" class="presets tag-container">
				<v-chip
					v-for="preset in presetVals"
					:key="preset"
					:class="['tag', { inactive: !selectedVals.includes(preset) }]"
					:disabled="disabled"
					:dir="direction"
					small
					label
					clickable
					@click="toggleTag(preset)"
				>
					{{ preset }}
				</v-chip>
			</span>
			<span v-if="customVals.length > 0 && allowCustom" class="custom tag-container">
				<v-icon v-if="presetVals.length > 0" class="custom-tags-delimiter" name="chevron_right"/>
				<v-chip
					v-for="(val, i) in customVals"
					:key="val"
					:disabled="disabled"
					:dir="direction"
					class="tag"
					small
					label
					clickable
					@click="removeTag(val)"
				>
					{{ val }}
					{{ getProperties(val, i) }}
				</v-chip>
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { computed, ref, watch } from 'vue';
	import { useI18n } from 'vue-i18n';
	import { useApi } from '@directus/extensions-sdk';

	const props = withDefaults(
		defineProps<{
			value: string[] | string | null;
			disabled?: boolean;
			placeholder?: string;
			whitespace?: string;
			capitalization?: 'uppercase' | 'lowercase' | 'auto-format';
			alphabetize?: boolean;
			iconLeft?: string;
			iconRight?: string;
			presets?: string[];
			allowCustom?: boolean;
			direction?: string;
		}>(),
		{
			iconRight: 'local_offer',
			allowCustom: true,
			placeholder: 'Generate new value using arrow button, then press Enter...',
			whitespace: undefined,
			capitalization: undefined,
			iconLeft: undefined,
			presets: undefined,
			direction: undefined,
		},
	);

	const emit = defineEmits([ 'input' ]);

	const api = useApi();

	const { t } = useI18n();

	function updateValue (newValue: string) {
		localValue.value = newValue;
	}

	const presetVals = computed<string[]>(() => {
		if (props.presets !== undefined) { return processArray(props.presets); }

		return [];
	});

	const getProperties = (val: string, index: number) => {
		const properties: string[] = [];

		if (val.length === 44) { properties.push('hashed'); }

		if (customVals.value.length - 1 === index) { properties.push('latest'); }

		return properties.length ? `(${properties.join(', ')})` : '';
	};

	const selectedValsLocal = ref<string[]>(Array.isArray(props.value) ? processArray(props.value) : []);

	watch(
		() => props.value,
		(newVal) => {
			if (Array.isArray(newVal)) {
				selectedValsLocal.value = processArray(newVal);
			}

			if (newVal === null) { selectedValsLocal.value = []; }
		},
	);

	const localValue = ref<string>('');
	const loading = ref(false);

	async function generateToken () {
		loading.value = true;

		try {
			const response = await api.post('/bytes', { size: 'lg' });
			localValue.value = response.data.data;
		} catch (err: any) {
			console.error(err);
			alert('Unexpected error occured, please contact the administrator');
		} finally {
			loading.value = false;
		}
	}

	const selectedVals = computed<string[]>(() => {
		let vals = processArray(selectedValsLocal.value);

		if (!props.allowCustom) {
			vals = vals.filter(val => presetVals.value.includes(val));
		}

		return vals;
	});

	const customVals = computed<string[]>(() => {
		return selectedVals.value.filter(val => !presetVals.value.includes(val));
	});

	function processArray (array: string[]): string[] {
		array = array.map((val) => {
			val = val.trim();

			if (props.capitalization === 'uppercase') { val = val.toUpperCase(); }

			if (props.capitalization === 'lowercase') { val = val.toLowerCase(); }

			const whitespace = props.whitespace === undefined ? ' ' : props.whitespace;

			val = val.replace(/ +/g, whitespace);

			return val;
		});

		if (props.alphabetize) {
			array = array.concat().sort();
		}

		array = [ ...new Set(array) ];

		return array;
	}

	function onInput (event: KeyboardEvent) {
		if (event.target && (event.key === 'Enter' || event.key === ',') && localValue.value) {
			event.preventDefault();
			addTag(localValue.value);
			localValue.value = '';
		}
	}

	function toggleTag (tag: string) {
		if (selectedVals.value.includes(tag)) {
			removeTag(tag);
		} else {
			addTag(tag);
		}
	}

	function addTag (tag: string) {
		if (!tag || tag === '') { return; }

		// Remove any leading / trailing whitespace from the value
		tag = tag.trim();
		// Convert the tag to lowercase
		selectedValsLocal.value.push(tag);
		emitValue();
	}

	function removeTag (tag: string) {
		selectedValsLocal.value = selectedValsLocal.value.filter(savedTag => savedTag !== tag);
		emitValue();
	}

	function emitValue () {
		emit('input', selectedVals.value);
	}
</script>

<style lang="scss" scoped>
.tags {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-start;
	padding: 4px 0px 0px;

	span.tag-container {
		display: contents;
	}

	.custom-tags-delimiter,
	.tag {
		margin-top: 8px;
		margin-right: 8px;
	}

	.presets {
		.v-chip {
			--v-chip-background-color: var(--theme--primary);
			--v-chip-color: var(--foreground-inverted);
			--v-chip-background-color-hover: var(--theme--danger);
			--v-chip-color-hover: var(--foreground-inverted);

			&.inactive {
				--v-chip-background-color: var(--theme--form--field--input--background-subdued);
				--v-chip-color: var(--theme--form--field--input--foreground-subdued);
				--v-chip-background-color-hover: var(--theme--primary);
				--v-chip-color-hover: var(--foreground-inverted);
			}
		}
	}

	.custom {
		.v-chip {
			--v-chip-background-color: var(--theme--primary);
			--v-chip-color: var(--foreground-inverted);
			--v-chip-background-color-hover: var(--theme--danger);
			--v-chip-close-color: var(--v-chip-background-color, var(--theme--background-normal));
			--v-chip-close-color-hover: var(--white);

			transition: all var(--fast) var(--transition);

			&:hover {
				--v-chip-close-color: var(--white);

				:deep(.chip-content .close-outline .close:hover) {
					--v-icon-color: var(--theme--danger);
				}
			}
		}
	}
}
</style>
