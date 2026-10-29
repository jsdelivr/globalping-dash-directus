<script setup lang="ts">
	import { useApi } from '@directus/extensions-sdk';
	import { onMounted } from 'vue';

	const api = useApi();

	onMounted(() => {
		const url = new URL(window.location.href).searchParams.get('url');
		window.location.replace(api.getUri({ url: '/redirect', params: { url } }));
	});
</script>

<template>
	<p>Redirecting to the dashboard...</p>
</template>
