FROM directus/directus:10.6.1

USER root

# Build and copy hooks/tokens
COPY ./src/extensions/hooks/tokens /app/src/extensions/hooks/tokens
WORKDIR /app/src/extensions/hooks/tokens
RUN npm ci --include dev
RUN npm run build
RUN mkdir -p /directus/extensions/hooks/tokens
RUN cp -rp /app/src/extensions/hooks/tokens/dist/* /directus/extensions/hooks/tokens/

# Build and copy hooks/sign-up
COPY ./src/extensions/hooks/sign-up /app/src/extensions/hooks/sign-up
WORKDIR /app/src/extensions/hooks/sign-up
RUN npm ci --include dev
RUN npm run build
RUN mkdir -p /directus/extensions/hooks/sign-up
RUN cp -rp /app/src/extensions/hooks/sign-up/dist/* /directus/extensions/hooks/sign-up/

# Build and copy interfaces/token
COPY ./src/extensions/interfaces/token /app/src/extensions/interfaces/token
WORKDIR /app/src/extensions/interfaces/token
RUN npm ci --include dev
RUN npm run build
RUN mkdir -p /directus/extensions/interfaces/token
RUN cp -rp /app/src/extensions/interfaces/token/dist/* /directus/extensions/interfaces/token/

# Build and copy token-value
COPY ./src/extensions/token-value /app/src/extensions/token-value
WORKDIR /app/src/extensions/token-value
RUN npm ci --include dev
RUN npm run build
RUN mkdir -p /directus/extensions/directus-extension-token-value/dist
RUN cp -rp /app/src/extensions/token-value/dist/* /directus/extensions/directus-extension-token-value/dist/
RUN cp -rp /app/src/extensions/token-value/package.json /directus/extensions/directus-extension-token-value/

# Build and copy gh-webhook-handler
COPY ./src/extensions/gh-webhook-handler /app/src/extensions/gh-webhook-handler
WORKDIR /app/src/extensions/gh-webhook-handler
RUN npm ci --include dev
RUN npm run build
RUN mkdir -p /directus/extensions/directus-extension-gh-webhook-handler/dist
RUN cp -rp /app/src/extensions/gh-webhook-handler/dist/* /directus/extensions/directus-extension-gh-webhook-handler/dist/
RUN cp -rp /app/src/extensions/gh-webhook-handler/package.json /directus/extensions/directus-extension-gh-webhook-handler/

# Build and copy sponsors-cron-handler
COPY ./src/extensions/sponsors-cron-handler /app/src/extensions/sponsors-cron-handler
WORKDIR /app/src/extensions/sponsors-cron-handler
RUN npm ci --include dev
RUN npm run build
RUN mkdir -p /directus/extensions/directus-extension-sponsors-cron-handler/dist
RUN cp -rp /app/src/extensions/sponsors-cron-handler/dist/* /directus/extensions/directus-extension-sponsors-cron-handler/dist/
RUN cp -rp /app/src/extensions/sponsors-cron-handler/package.json /directus/extensions/directus-extension-sponsors-cron-handler/

# Build and copy modules/probes-adapter
COPY ./src/extensions/modules/probes-adapter /app/src/extensions/modules/probes-adapter
WORKDIR /app/src/extensions/modules/probes-adapter
RUN npm ci --include dev
RUN npm run build
RUN mkdir -p /directus/extensions/modules/probes-adapter
RUN cp -rp /app/src/extensions/modules/probes-adapter/dist/* /directus/extensions/modules/probes-adapter/

# Build and copy endpoints/adoption-code
COPY ./src/extensions/endpoints/adoption-code /app/src/extensions/endpoints/adoption-code
WORKDIR /app/src/extensions/endpoints/adoption-code
RUN npm ci --include dev
RUN npm run build
RUN mkdir -p /directus/extensions/endpoints/adoption-code
RUN cp -rp /app/src/extensions/endpoints/adoption-code/dist/* /directus/extensions/endpoints/adoption-code/
