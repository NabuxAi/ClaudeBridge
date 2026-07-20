# ---- install prod deps (better-sqlite3 native addon) ----
FROM node:20-bookworm AS deps
WORKDIR /app
# Optional build-time proxy + extra CA (for corporate / self-hosted networks).
# All no-ops when unset, so normal builds are unaffected.
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ENV HTTP_PROXY=${HTTP_PROXY} HTTPS_PROXY=${HTTPS_PROXY} \
    http_proxy=${HTTP_PROXY} https_proxy=${HTTPS_PROXY} NO_PROXY=localhost,127.0.0.1
# Toolchain so better-sqlite3 compiles when a prebuilt binary isn't available.
RUN --mount=type=secret,id=ca_bundle,target=/usr/local/share/ca-certificates/extra.crt \
    { [ -s /usr/local/share/ca-certificates/extra.crt ] && update-ca-certificates; }; \
    apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca_bundle,target=/tmp/ca.crt \
    { [ -s /tmp/ca.crt ] && export NODE_EXTRA_CA_CERTS=/tmp/ca.crt; }; \
    npm ci --omit=dev --no-audit --no-fund

# ---- slim runtime ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN mkdir -p /data
ENV PORT=8787 DB_FILE=/data/digiwp.db
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8787) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
