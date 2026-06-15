FROM node:22-alpine AS builder

RUN corepack enable
WORKDIR /builder
COPY package.json pnpm-*.yaml ./

# Update via `pnpm run docker:ls:update`
# START: EXTENSIONS-BUILD-BLOCK
COPY src/extensions/bytes-value/package.json src/extensions/bytes-value/
COPY src/extensions/endpoints/adoption-code/package.json src/extensions/endpoints/adoption-code/
COPY src/extensions/endpoints/applications/package.json src/extensions/endpoints/applications/
COPY src/extensions/endpoints/city-autocomplete/package.json src/extensions/endpoints/city-autocomplete/
COPY src/extensions/endpoints/credits-timeline/package.json src/extensions/endpoints/credits-timeline/
COPY src/extensions/endpoints/email-unsubscribe/package.json src/extensions/endpoints/email-unsubscribe/
COPY src/extensions/endpoints/local-adoption/package.json src/extensions/endpoints/local-adoption/
COPY src/extensions/endpoints/metadata/package.json src/extensions/endpoints/metadata/
COPY src/extensions/endpoints/redirect/package.json src/extensions/endpoints/redirect/
COPY src/extensions/endpoints/sponsorship-details/package.json src/extensions/endpoints/sponsorship-details/
COPY src/extensions/endpoints/sync-github-data/package.json src/extensions/endpoints/sync-github-data/
COPY src/extensions/hooks/adopted-probe/package.json src/extensions/hooks/adopted-probe/
COPY src/extensions/hooks/cors/package.json src/extensions/hooks/cors/
COPY src/extensions/hooks/directus-users/package.json src/extensions/hooks/directus-users/
COPY src/extensions/hooks/elastic-apm/package.json src/extensions/hooks/elastic-apm/
COPY src/extensions/hooks/email-sender/package.json src/extensions/hooks/email-sender/
COPY src/extensions/hooks/gp-tokens/package.json src/extensions/hooks/gp-tokens/
COPY src/extensions/hooks/location-overrides/package.json src/extensions/hooks/location-overrides/
COPY src/extensions/hooks/notifications/package.json src/extensions/hooks/notifications/
COPY src/extensions/hooks/notifications-format/package.json src/extensions/hooks/notifications-format/
COPY src/extensions/hooks/sign-in/package.json src/extensions/hooks/sign-in/
COPY src/extensions/hooks/sign-up/package.json src/extensions/hooks/sign-up/
COPY src/extensions/interfaces/github-username/package.json src/extensions/interfaces/github-username/
COPY src/extensions/interfaces/gp-tags/package.json src/extensions/interfaces/gp-tags/
COPY src/extensions/interfaces/secrets/package.json src/extensions/interfaces/secrets/
COPY src/extensions/interfaces/tag-prefix-selector/package.json src/extensions/interfaces/tag-prefix-selector/
COPY src/extensions/interfaces/token/package.json src/extensions/interfaces/token/
COPY src/extensions/interfaces/visible-token/package.json src/extensions/interfaces/visible-token/
COPY src/extensions/lib/package.json src/extensions/lib/
COPY src/extensions/modules/probes-adapter/package.json src/extensions/modules/probes-adapter/
COPY src/extensions/operations/adopted-probes-credits-cron-handler/package.json src/extensions/operations/adopted-probes-credits-cron-handler/
COPY src/extensions/operations/check-outdated-firmware-cron-handler/package.json src/extensions/operations/check-outdated-firmware-cron-handler/
COPY src/extensions/operations/gh-webhook-handler/package.json src/extensions/operations/gh-webhook-handler/
COPY src/extensions/operations/low-credits-cron-handler/package.json src/extensions/operations/low-credits-cron-handler/
COPY src/extensions/operations/probes-status-cron-handler/package.json src/extensions/operations/probes-status-cron-handler/
COPY src/extensions/operations/remove-banned-users-cron-handler/package.json src/extensions/operations/remove-banned-users-cron-handler/
COPY src/extensions/operations/remove-expired-adoptions-cron-handler/package.json src/extensions/operations/remove-expired-adoptions-cron-handler/
COPY src/extensions/operations/sponsors-cron-handler/package.json src/extensions/operations/sponsors-cron-handler/
# END: EXTENSIONS-BUILD-BLOCK

RUN pnpm install --frozen-lockfile
COPY src src
RUN pnpm -r build
RUN pnpm --filter elastic-apm deploy --prod --legacy /apm-deploy
RUN set -eux; \
	mkdir -p /out/extensions; \
	for dist in $(find src/extensions -type d -name dist ! -path '*/node_modules/*' ! -path '*/dist/*'); do \
		dir=$(dirname "$dist"); name=$(basename "$dir"); \
		mkdir -p "/out/extensions/$name/dist"; \
		cp -r "$dist/." "/out/extensions/$name/dist/"; \
		cp "$dir/package.json" "/out/extensions/$name/package.json"; \
	done; \
	cp -r src/extensions/endpoints/city-autocomplete/data /out/extensions/city-autocomplete/data

FROM directus/directus:11.17.4

ENV ELASTIC_APM_CONFIG_FILE=/directus/apm/elastic-apm-node.cjs
COPY --from=builder /apm-deploy/node_modules /directus/apm/node_modules
COPY src/extensions/hooks/elastic-apm/apm/ /directus/apm/
ENV NODE_OPTIONS="--experimental-loader /directus/apm/node_modules/elastic-apm-node/loader.mjs -r /directus/apm/node_modules/elastic-apm-node/start.js -r /directus/apm/elastic-apm-filters.cjs"
COPY --from=builder /out/extensions /directus/extensions
