# ---- install prod deps (pure JS — no native toolchain needed) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Optional build-time proxy + extra CA (for corporate / self-hosted networks).
# All no-ops when unset, so normal builds are unaffected.
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ENV HTTP_PROXY=${HTTP_PROXY} HTTPS_PROXY=${HTTPS_PROXY} NO_PROXY=localhost,127.0.0.1
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
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8787) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
