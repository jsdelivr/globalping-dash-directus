FROM node:20-alpine AS builder

# Temp corepack fix: https://github.com/nodejs/corepack/issues/612
RUN corepack install -g pnpm@9.15.2

RUN corepack enable
WORKDIR /builder
COPY package.json pnpm-*.yaml ./

# Update via `pnpm run docker:ls:update`
# START: EXTENSIONS-BUILD-BLOCK
COPY src/extensions/bytes-value/package.json src/extensions/bytes-value/
COPY src/extensions/endpoints/adoption-code/package.json src/extensions/endpoints/adoption-code/
COPY src/extensions/endpoints/applications/package.json src/extensions/endpoints/applications/
COPY src/extensions/endpoints/credits-timeline/package.json src/extensions/endpoints/credits-timeline/
COPY src/extensions/endpoints/metadata/package.json src/extensions/endpoints/metadata/
COPY src/extensions/endpoints/redirect/package.json src/extensions/endpoints/redirect/
COPY src/extensions/endpoints/sync-github-data/package.json src/extensions/endpoints/sync-github-data/
COPY src/extensions/hooks/adopted-probe/package.json src/extensions/hooks/adopted-probe/
COPY src/extensions/hooks/directus-users/package.json src/extensions/hooks/directus-users/
COPY src/extensions/hooks/gp-tokens/package.json src/extensions/hooks/gp-tokens/
COPY src/extensions/hooks/location-overrides/package.json src/extensions/hooks/location-overrides/
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
COPY src/extensions/operations/probes-status-cron-handler/package.json src/extensions/operations/probes-status-cron-handler/
COPY src/extensions/operations/remove-banned-users-cron-handler/package.json src/extensions/operations/remove-banned-users-cron-handler/
COPY src/extensions/operations/remove-expired-adoptions-cron-handler/package.json src/extensions/operations/remove-expired-adoptions-cron-handler/
COPY src/extensions/operations/sponsors-cron-handler/package.json src/extensions/operations/sponsors-cron-handler/
# END: EXTENSIONS-BUILD-BLOCK

RUN pnpm install
COPY src src
RUN pnpm -r build

FROM directus/directus:11.1.1

# Update via `pnpm run docker:ls:update`
# START: EXTENSIONS-RUN-BLOCK
COPY --from=builder /builder/src/extensions/bytes-value/dist/* /directus/extensions/bytes-value/dist/
COPY --from=builder /builder/src/extensions/bytes-value/package.json /directus/extensions/bytes-value/
COPY --from=builder /builder/src/extensions/endpoints/adoption-code/dist/* /directus/extensions/adoption-code/dist/
COPY --from=builder /builder/src/extensions/endpoints/adoption-code/package.json /directus/extensions/adoption-code/
COPY --from=builder /builder/src/extensions/endpoints/applications/dist/* /directus/extensions/applications/dist/
COPY --from=builder /builder/src/extensions/endpoints/applications/package.json /directus/extensions/applications/
COPY --from=builder /builder/src/extensions/endpoints/credits-timeline/dist/* /directus/extensions/credits-timeline/dist/
COPY --from=builder /builder/src/extensions/endpoints/credits-timeline/package.json /directus/extensions/credits-timeline/
COPY --from=builder /builder/src/extensions/endpoints/metadata/dist/* /directus/extensions/metadata/dist/
COPY --from=builder /builder/src/extensions/endpoints/metadata/package.json /directus/extensions/metadata/
COPY --from=builder /builder/src/extensions/endpoints/redirect/dist/* /directus/extensions/redirect/dist/
COPY --from=builder /builder/src/extensions/endpoints/redirect/package.json /directus/extensions/redirect/
COPY --from=builder /builder/src/extensions/endpoints/sync-github-data/dist/* /directus/extensions/sync-github-data/dist/
COPY --from=builder /builder/src/extensions/endpoints/sync-github-data/package.json /directus/extensions/sync-github-data/
COPY --from=builder /builder/src/extensions/hooks/adopted-probe/dist/* /directus/extensions/adopted-probe/dist/
COPY --from=builder /builder/src/extensions/hooks/adopted-probe/package.json /directus/extensions/adopted-probe/
COPY --from=builder /builder/src/extensions/hooks/directus-users/dist/* /directus/extensions/directus-users/dist/
COPY --from=builder /builder/src/extensions/hooks/directus-users/package.json /directus/extensions/directus-users/
COPY --from=builder /builder/src/extensions/hooks/gp-tokens/dist/* /directus/extensions/gp-tokens/dist/
COPY --from=builder /builder/src/extensions/hooks/gp-tokens/package.json /directus/extensions/gp-tokens/
COPY --from=builder /builder/src/extensions/hooks/location-overrides/dist/* /directus/extensions/location-overrides/dist/
COPY --from=builder /builder/src/extensions/hooks/location-overrides/package.json /directus/extensions/location-overrides/
COPY --from=builder /builder/src/extensions/hooks/notifications-format/dist/* /directus/extensions/notifications-format/dist/
COPY --from=builder /builder/src/extensions/hooks/notifications-format/package.json /directus/extensions/notifications-format/
COPY --from=builder /builder/src/extensions/hooks/sign-in/dist/* /directus/extensions/sign-in/dist/
COPY --from=builder /builder/src/extensions/hooks/sign-in/package.json /directus/extensions/sign-in/
COPY --from=builder /builder/src/extensions/hooks/sign-up/dist/* /directus/extensions/sign-up/dist/
COPY --from=builder /builder/src/extensions/hooks/sign-up/package.json /directus/extensions/sign-up/
COPY --from=builder /builder/src/extensions/interfaces/github-username/dist/* /directus/extensions/github-username/dist/
COPY --from=builder /builder/src/extensions/interfaces/github-username/package.json /directus/extensions/github-username/
COPY --from=builder /builder/src/extensions/interfaces/gp-tags/dist/* /directus/extensions/gp-tags/dist/
COPY --from=builder /builder/src/extensions/interfaces/gp-tags/package.json /directus/extensions/gp-tags/
COPY --from=builder /builder/src/extensions/interfaces/secrets/dist/* /directus/extensions/secrets/dist/
COPY --from=builder /builder/src/extensions/interfaces/secrets/package.json /directus/extensions/secrets/
COPY --from=builder /builder/src/extensions/interfaces/tag-prefix-selector/dist/* /directus/extensions/tag-prefix-selector/dist/
COPY --from=builder /builder/src/extensions/interfaces/tag-prefix-selector/package.json /directus/extensions/tag-prefix-selector/
COPY --from=builder /builder/src/extensions/interfaces/token/dist/* /directus/extensions/token/dist/
COPY --from=builder /builder/src/extensions/interfaces/token/package.json /directus/extensions/token/
COPY --from=builder /builder/src/extensions/interfaces/visible-token/dist/* /directus/extensions/visible-token/dist/
COPY --from=builder /builder/src/extensions/interfaces/visible-token/package.json /directus/extensions/visible-token/
COPY --from=builder /builder/src/extensions/modules/probes-adapter/dist/* /directus/extensions/probes-adapter/dist/
COPY --from=builder /builder/src/extensions/modules/probes-adapter/package.json /directus/extensions/probes-adapter/
COPY --from=builder /builder/src/extensions/operations/adopted-probes-credits-cron-handler/dist/* /directus/extensions/adopted-probes-credits-cron-handler/dist/
COPY --from=builder /builder/src/extensions/operations/adopted-probes-credits-cron-handler/package.json /directus/extensions/adopted-probes-credits-cron-handler/
COPY --from=builder /builder/src/extensions/operations/check-outdated-firmware-cron-handler/dist/* /directus/extensions/check-outdated-firmware-cron-handler/dist/
COPY --from=builder /builder/src/extensions/operations/check-outdated-firmware-cron-handler/package.json /directus/extensions/check-outdated-firmware-cron-handler/
COPY --from=builder /builder/src/extensions/operations/gh-webhook-handler/dist/* /directus/extensions/gh-webhook-handler/dist/
COPY --from=builder /builder/src/extensions/operations/gh-webhook-handler/package.json /directus/extensions/gh-webhook-handler/
COPY --from=builder /builder/src/extensions/operations/probes-status-cron-handler/dist/* /directus/extensions/probes-status-cron-handler/dist/
COPY --from=builder /builder/src/extensions/operations/probes-status-cron-handler/package.json /directus/extensions/probes-status-cron-handler/
COPY --from=builder /builder/src/extensions/operations/remove-banned-users-cron-handler/dist/* /directus/extensions/remove-banned-users-cron-handler/dist/
COPY --from=builder /builder/src/extensions/operations/remove-banned-users-cron-handler/package.json /directus/extensions/remove-banned-users-cron-handler/
COPY --from=builder /builder/src/extensions/operations/remove-expired-adoptions-cron-handler/dist/* /directus/extensions/remove-expired-adoptions-cron-handler/dist/
COPY --from=builder /builder/src/extensions/operations/remove-expired-adoptions-cron-handler/package.json /directus/extensions/remove-expired-adoptions-cron-handler/
COPY --from=builder /builder/src/extensions/operations/sponsors-cron-handler/dist/* /directus/extensions/sponsors-cron-handler/dist/
COPY --from=builder /builder/src/extensions/operations/sponsors-cron-handler/package.json /directus/extensions/sponsors-cron-handler/
# END: EXTENSIONS-RUN-BLOCK
