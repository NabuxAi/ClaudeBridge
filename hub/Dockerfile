# ---- build the Vite app ----
FROM node:20-bookworm AS build
WORKDIR /app
# Optional build-time proxy + extra CA (for corporate / self-hosted networks).
# All no-ops when unset, so normal builds are unaffected.
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ENV HTTP_PROXY=${HTTP_PROXY} HTTPS_PROXY=${HTTPS_PROXY} NO_PROXY=localhost,127.0.0.1
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca_bundle,target=/tmp/ca.crt \
    { [ -s /tmp/ca.crt ] && export NODE_EXTRA_CA_CERTS=/tmp/ca.crt; }; \
    npm ci --include=dev --no-audit --no-fund
COPY . .
# The API is same-origin at /api (nginx proxies it to the server), so the
# built app talks to /api regardless of the deployed domain.
ENV VITE_USE_MOCK=0 VITE_API_BASE_URL=/api
RUN npm run build

# ---- serve static + proxy /api ----
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
