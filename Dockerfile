# Build hooks/tokens
FROM node:18-alpine AS builder-01
WORKDIR /builder/src/extensions/hooks/tokens
ADD ./src/extensions/hooks/tokens/package.json ./src/extensions/hooks/tokens/package-lock.json ./
RUN npm ci
COPY ./src/extensions/hooks/tokens .
RUN npm run build

# Build hooks/sign-up
FROM node:18-alpine AS builder-02
WORKDIR /builder/src/extensions/hooks/sign-up
ADD ./src/extensions/hooks/sign-up/package.json ./src/extensions/hooks/sign-up/package-lock.json ./
RUN npm ci
COPY ./src/extensions/hooks/sign-up .
RUN npm run build

# Build interfaces/token
FROM node:18-alpine AS builder-03
WORKDIR /builder/src/extensions/interfaces/token
ADD ./src/extensions/interfaces/token/package.json ./src/extensions/interfaces/token/package-lock.json ./
RUN npm ci
COPY ./src/extensions/interfaces/token .
RUN npm run build

# Build token-value
FROM node:18-alpine AS builder-04
WORKDIR /builder/src/extensions/token-value
ADD ./src/extensions/token-value/package.json ./src/extensions/token-value/package-lock.json ./
RUN npm ci
COPY ./src/extensions/token-value .
RUN npm run build

# Build gh-webhook-handler
FROM node:18-alpine AS builder-05
WORKDIR /builder/src/extensions/gh-webhook-handler
ADD ./src/extensions/gh-webhook-handler/package.json ./src/extensions/gh-webhook-handler/package-lock.json ./
RUN npm ci
COPY ./src/extensions/gh-webhook-handler .
RUN npm run build

# Build sponsors-cron-handler
FROM node:18-alpine AS builder-06
WORKDIR /builder/src/extensions/sponsors-cron-handler
ADD ./src/extensions/sponsors-cron-handler/package.json ./src/extensions/sponsors-cron-handler/package-lock.json ./
RUN npm ci
COPY ./src/extensions/sponsors-cron-handler .
RUN npm run build

# Build modules/probes-adapter
FROM node:18-alpine AS builder-07
WORKDIR /builder/src/extensions/modules/probes-adapter
ADD ./src/extensions/modules/probes-adapter/package.json ./src/extensions/modules/probes-adapter/package-lock.json ./
RUN npm ci
COPY ./src/extensions/modules/probes-adapter .
RUN npm run build

# Build endpoints/adoption-code
FROM node:18-alpine AS builder-08
WORKDIR /builder/src/extensions/endpoints/adoption-code
ADD ./src/extensions/endpoints/adoption-code/package.json ./src/extensions/endpoints/adoption-code/package-lock.json ./
RUN npm ci
COPY ./src/extensions/endpoints/adoption-code .
RUN npm run build

# Build hooks/adopted-probe
FROM node:18-alpine AS builder-09
WORKDIR /builder/src/extensions/hooks/adopted-probe
ADD ./src/extensions/hooks/adopted-probe/package.json ./src/extensions/hooks/adopted-probe/package-lock.json ./
RUN npm ci
COPY ./src/extensions/hooks/adopted-probe .
RUN npm run build

# Build hooks/sign-in
FROM node:18-alpine AS builder-10
WORKDIR /builder/src/extensions/hooks/sign-in
ADD ./src/extensions/hooks/sign-in/package.json ./src/extensions/hooks/sign-in/package-lock.json ./
RUN npm ci
COPY ./src/extensions/hooks/sign-in .
RUN npm run build

# Build endpoints/sync-github-data
FROM node:18-alpine AS builder-11
WORKDIR /builder/src/extensions/endpoints/sync-github-data
ADD ./src/extensions/endpoints/sync-github-data/package.json ./src/extensions/endpoints/sync-github-data/package-lock.json ./
RUN npm ci
COPY ./src/extensions/endpoints/sync-github-data .
RUN npm run build

# Build interfaces/github-username
FROM node:18-alpine AS builder-12
WORKDIR /builder/src/extensions/interfaces/github-username
ADD ./src/extensions/interfaces/github-username/package.json ./src/extensions/interfaces/github-username/package-lock.json ./
RUN npm ci
COPY ./src/extensions/interfaces/github-username .
RUN npm run build

# Build adopted-probes-status-cron-handler
FROM node:18-alpine AS builder-13
WORKDIR /builder/src/extensions/adopted-probes-status-cron-handler
ADD ./src/extensions/adopted-probes-status-cron-handler/package.json ./src/extensions/adopted-probes-status-cron-handler/package-lock.json ./
RUN npm ci
COPY ./src/extensions/adopted-probes-status-cron-handler .
RUN npm run build

# Build adopted-probes-credits-cron-handler
FROM node:18-alpine AS builder-14
WORKDIR /builder/src/extensions/adopted-probes-credits-cron-handler
ADD ./src/extensions/adopted-probes-credits-cron-handler/package.json ./src/extensions/adopted-probes-credits-cron-handler/package-lock.json ./
RUN npm ci
COPY ./src/extensions/adopted-probes-credits-cron-handler .
RUN npm run build

# Build interfaces/gp-tags
FROM node:18-alpine AS builder-15
WORKDIR /builder/src/extensions/interfaces/gp-tags
ADD ./src/extensions/interfaces/gp-tags/package.json ./src/extensions/interfaces/gp-tags/package-lock.json ./
RUN npm ci
COPY ./src/extensions/interfaces/gp-tags .
RUN npm run build

FROM directus/directus:10.8.2

COPY --from=builder-01 /builder/src/extensions/hooks/tokens/dist/* /directus/extensions/hooks/tokens/
COPY --from=builder-02 /builder/src/extensions/hooks/sign-up/dist/* /directus/extensions/hooks/sign-up/
COPY --from=builder-03 /builder/src/extensions/interfaces/token/dist/* /directus/extensions/interfaces/token/
COPY --from=builder-04 /builder/src/extensions/token-value/dist/* /directus/extensions/directus-extension-token-value/dist/
COPY --from=builder-04 /builder/src/extensions/token-value/package.json /directus/extensions/directus-extension-token-value/
COPY --from=builder-05 /builder/src/extensions/gh-webhook-handler/dist/* /directus/extensions/directus-extension-gh-webhook-handler/dist/
COPY --from=builder-05 /builder/src/extensions/gh-webhook-handler/package.json /directus/extensions/directus-extension-gh-webhook-handler/
COPY --from=builder-06 /builder/src/extensions/sponsors-cron-handler/dist/* /directus/extensions/directus-extension-sponsors-cron-handler/dist/
COPY --from=builder-06 /builder/src/extensions/sponsors-cron-handler/package.json /directus/extensions/directus-extension-sponsors-cron-handler/
COPY --from=builder-07 /builder/src/extensions/modules/probes-adapter/dist/* /directus/extensions/modules/probes-adapter/
COPY --from=builder-08 /builder/src/extensions/endpoints/adoption-code/dist/* /directus/extensions/endpoints/adoption-code/
COPY --from=builder-09 /builder/src/extensions/hooks/adopted-probe/dist/* /directus/extensions/hooks/adopted-probe/
COPY --from=builder-10 /builder/src/extensions/hooks/sign-in/dist/* /directus/extensions/hooks/sign-in/
COPY --from=builder-11 /builder/src/extensions/endpoints/sync-github-data/dist/* /directus/extensions/endpoints/sync-github-data/
COPY --from=builder-12 /builder/src/extensions/interfaces/github-username/dist/* /directus/extensions/interfaces/github-username/
COPY --from=builder-13 /builder/src/extensions/adopted-probes-status-cron-handler/dist/* /directus/extensions/directus-extension-adopted-probes-status-cron-handler/dist/
COPY --from=builder-13 /builder/src/extensions/adopted-probes-status-cron-handler/package.json /directus/extensions/directus-extension-adopted-probes-status-cron-handler/
COPY --from=builder-14 /builder/src/extensions/adopted-probes-credits-cron-handler/dist/* /directus/extensions/directus-extension-adopted-probes-credits-cron-handler/dist/
COPY --from=builder-14 /builder/src/extensions/adopted-probes-credits-cron-handler/package.json /directus/extensions/directus-extension-adopted-probes-credits-cron-handler/
COPY --from=builder-15 /builder/src/extensions/interfaces/gp-tags/dist/* /directus/extensions/interfaces/gp-tags/
