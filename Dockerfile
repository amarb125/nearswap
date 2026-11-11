# ---- deps ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---- migrator: just the Prisma CLI, used at boot to apply migrations ----
FROM node:22-bookworm-slim AS migrator
WORKDIR /migrate
COPY package.json package-lock.json ./
RUN PRISMA_VER=$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version") \
  && DOTENV_VER=$(node -p "require('./package-lock.json').packages['node_modules/dotenv'].version") \
  && rm package.json package-lock.json \
  && npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund "prisma@$PRISMA_VER" "dotenv@$DOTENV_VER"
COPY prisma.config.ts ./
COPY prisma ./prisma

# ---- build ----
FROM deps AS build
WORKDIR /app
COPY . .
ARG NEXT_PUBLIC_APP_NAME=Nearswap
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build \
  # Next 16 links externals (pg, @prisma/client) via .next/node_modules symlinks. They must be
  # relative, or they break once the bundle is copied into the runtime stage below.
  && if find .next/standalone -type l -lname '/*' | grep -q .; then \
       echo "Absolute symlinks in standalone output:"; find .next/standalone -type l -lname '/*' -printf '%p -> %l\n'; exit 1; \
     fi

# ---- runtime ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && groupadd -r app && useradd -r -g app app && mkdir -p /app/uploads && chown app:app /app/uploads
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=migrator /migrate /migrate
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start
CMD ["sh", "-c", "cd /migrate && node node_modules/prisma/build/index.js migrate deploy && cd /app && exec node server.js"]
