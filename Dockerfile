FROM node:18-alpine AS builder

# Build hooks/tokens
COPY ./src/extensions/hooks/tokens /builder/src/extensions/hooks/tokens
WORKDIR /builder/src/extensions/hooks/tokens
RUN npm ci
RUN npm run build

# Build hooks/sign-up
COPY ./src/extensions/hooks/sign-up /builder/src/extensions/hooks/sign-up
WORKDIR /builder/src/extensions/hooks/sign-up
RUN npm ci
RUN npm run build

# # Build interfaces/token
COPY ./src/extensions/interfaces/token /builder/src/extensions/interfaces/token
WORKDIR /builder/src/extensions/interfaces/token
RUN npm ci
RUN npm run build

# Build token-value
COPY ./src/extensions/token-value /builder/src/extensions/token-value
WORKDIR /builder/src/extensions/token-value
RUN npm ci
RUN npm run build
RUN mkdir -p /directus/extensions/directus-extension-token-value/dist

# Build gh-webhook-handler
COPY ./src/extensions/gh-webhook-handler /builder/src/extensions/gh-webhook-handler
WORKDIR /builder/src/extensions/gh-webhook-handler
RUN npm ci
RUN npm run build
RUN mkdir -p /directus/extensions/directus-extension-gh-webhook-handler/dist

# Build sponsors-cron-handler
COPY ./src/extensions/sponsors-cron-handler /builder/src/extensions/sponsors-cron-handler
WORKDIR /builder/src/extensions/sponsors-cron-handler
RUN npm ci
RUN npm run build
RUN mkdir -p /directus/extensions/directus-extension-sponsors-cron-handler/dist

# Build modules/probes-adapter
COPY ./src/extensions/modules/probes-adapter /builder/src/extensions/modules/probes-adapter
WORKDIR /builder/src/extensions/modules/probes-adapter
RUN npm ci
RUN npm run build
RUN mkdir -p /directus/extensions/modules/probes-adapter

# Build endpoints/adoption-code
COPY ./src/extensions/endpoints/adoption-code /builder/src/extensions/endpoints/adoption-code
WORKDIR /builder/src/extensions/endpoints/adoption-code
RUN npm ci
RUN npm run build
RUN mkdir -p /directus/extensions/endpoints/adoption-code

FROM directus/directus:10.6.1

COPY --from=builder /builder/src/extensions/hooks/tokens/dist/* /directus/extensions/hooks/tokens/
COPY --from=builder /builder/src/extensions/hooks/sign-up/dist/* /directus/extensions/hooks/sign-up/
COPY --from=builder /builder/src/extensions/interfaces/token/dist/* /directus/extensions/interfaces/token/
COPY --from=builder /builder/src/extensions/token-value/dist/* /directus/extensions/directus-extension-token-value/dist/
COPY --from=builder /builder/src/extensions/token-value/package.json /directus/extensions/directus-extension-token-value/
COPY --from=builder /builder/src/extensions/gh-webhook-handler/dist/* /directus/extensions/directus-extension-gh-webhook-handler/dist/
COPY --from=builder /builder/src/extensions/gh-webhook-handler/package.json /directus/extensions/directus-extension-gh-webhook-handler/
COPY --from=builder /builder/src/extensions/sponsors-cron-handler/dist/* /directus/extensions/directus-extension-sponsors-cron-handler/dist/
COPY --from=builder /builder/src/extensions/sponsors-cron-handler/package.json /directus/extensions/directus-extension-sponsors-cron-handler/
COPY --from=builder /builder/src/extensions/modules/probes-adapter/dist/* /directus/extensions/modules/probes-adapter/
COPY --from=builder /builder/src/extensions/endpoints/adoption-code/dist/* /directus/extensions/endpoints/adoption-code/
