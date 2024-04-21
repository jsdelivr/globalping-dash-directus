FROM node:18-alpine as builder
RUN corepack enable
WORKDIR /builder
COPY package.json pnpm-*.yaml ./

# START: generate via scripts/docker-ls.sh
COPY src/extensions/lib/package.json src/extensions/endpoints/adoption-code/package.json ./
COPY src/extensions/endpoints/sync-github-data/package.json src/extensions/endpoints/sync-github-data/
COPY src/extensions/hooks/adopted-probe/package.json src/extensions/hooks/adopted-probe/
COPY src/extensions/hooks/directus-users/package.json src/extensions/hooks/directus-users/
COPY src/extensions/hooks/gp-tokens/package.json src/extensions/hooks/gp-tokens/
COPY src/extensions/hooks/location-overrides/package.json src/extensions/hooks/location-overrides/
COPY src/extensions/hooks/sign-in/package.json src/extensions/hooks/sign-in/
COPY src/extensions/hooks/sign-up/package.json src/extensions/hooks/sign-up/
COPY src/extensions/interfaces/github-username/package.json src/extensions/interfaces/github-username/
COPY src/extensions/interfaces/gp-tags/package.json src/extensions/interfaces/gp-tags/
COPY src/extensions/interfaces/token/package.json src/extensions/interfaces/token/
COPY src/extensions/lib/package.json src/extensions/lib/
COPY src/extensions/modules/probes-adapter/package.json src/extensions/modules/probes-adapter/
COPY src/extensions/operations/adopted-probes-credits-cron-handler/package.json src/extensions/operations/adopted-probes-credits-cron-handler/
COPY src/extensions/operations/adopted-probes-status-cron-handler/package.json src/extensions/operations/adopted-probes-status-cron-handler/
COPY src/extensions/operations/gh-webhook-handler/package.json src/extensions/operations/gh-webhook-handler/
COPY src/extensions/operations/remove-banned-users-cron-handler/package.json src/extensions/operations/remove-banned-users-cron-handler/
COPY src/extensions/operations/sponsors-cron-handler/package.json src/extensions/operations/sponsors-cron-handler/
COPY src/extensions/token-value/package.json src/extensions/token-value/
# END: generate via scripts/docker-ls.sh

RUN pnpm install
COPY src src
RUN pnpm -r build

FROM directus/directus:10.9.3

COPY --from=builder /builder/src/extensions/hooks/sign-up/dist/* /directus/extensions/hooks/sign-up/
COPY --from=builder /builder/src/extensions/interfaces/token/dist/* /directus/extensions/interfaces/token/
COPY --from=builder /builder/src/extensions/token-value/dist/* /directus/extensions/directus-extension-token-value/dist/
COPY --from=builder /builder/src/extensions/token-value/package.json /directus/extensions/directus-extension-token-value/
COPY --from=builder /builder/src/extensions/operations/gh-webhook-handler/dist/* /directus/extensions/operations/gh-webhook-handler/
COPY --from=builder /builder/src/extensions/operations/sponsors-cron-handler/dist/* /directus/extensions/operations/sponsors-cron-handler/
COPY --from=builder /builder/src/extensions/modules/probes-adapter/dist/* /directus/extensions/modules/probes-adapter/
COPY --from=builder /builder/src/extensions/endpoints/adoption-code/dist/* /directus/extensions/endpoints/adoption-code/
COPY --from=builder /builder/src/extensions/hooks/adopted-probe/dist/* /directus/extensions/hooks/adopted-probe/
COPY --from=builder /builder/src/extensions/hooks/sign-in/dist/* /directus/extensions/hooks/sign-in/
COPY --from=builder /builder/src/extensions/endpoints/sync-github-data/dist/* /directus/extensions/endpoints/sync-github-data/
COPY --from=builder /builder/src/extensions/interfaces/github-username/dist/* /directus/extensions/interfaces/github-username/
COPY --from=builder /builder/src/extensions/operations/adopted-probes-status-cron-handler/dist/* /directus/extensions/operations/adopted-probes-status-cron-handler/
COPY --from=builder /builder/src/extensions/operations/adopted-probes-credits-cron-handler/dist/* /directus/extensions/operations/adopted-probes-credits-cron-handler/
COPY --from=builder /builder/src/extensions/interfaces/gp-tags/dist/* /directus/extensions/interfaces/gp-tags/
COPY --from=builder /builder/src/extensions/operations/remove-banned-users-cron-handler/dist/* /directus/extensions/operations/remove-banned-users-cron-handler/
COPY --from=builder /builder/src/extensions/hooks/gp-tokens/dist/* /directus/extensions/hooks/gp-tokens/
COPY --from=builder /builder/src/extensions/hooks/directus-users/dist/* /directus/extensions/hooks/directus-users/
COPY --from=builder /builder/src/extensions/hooks/location-overrides/dist/* /directus/extensions/hooks/location-overrides/
