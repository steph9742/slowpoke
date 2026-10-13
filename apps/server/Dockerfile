FROM oven/bun:1.3.14-alpine AS base
WORKDIR /app

# Stage 1: Prune workspace to only include @slowpoke/server dependencies
FROM base AS pruner
RUN bun add -g turbo
COPY . .
RUN turbo prune @slowpoke/server --docker

# Stage 2: Install dependencies
FROM base AS installer
# Copy pruned package.json(s) and lockfile
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/bun.lock ./bun.lock

# Install dependencies (including dev tools if needed)
RUN bun install --frozen-lockfile --production

# Copy the rest of the pruned workspace
COPY --from=pruner /app/out/full/ .

FROM installer AS builder
WORKDIR /app/apps/server

RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile /app/server \
    src/index.ts && \
    bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile /app/migrate \
    src/migrate.ts && \
    bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile /app/seed \
    src/seed.ts

# Stage 3: Runner
FROM oven/bun:1.3.14-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

# Run as non-root user
RUN addgroup --system --gid 1001 slowpoke
RUN adduser --system --uid 1001 bunjs

# Les pièces jointes s'écrivent ici. `/app` appartient à root — le répertoire doit donc
# exister ET appartenir à `bunjs` AVANT de perdre les droits, sinon la première écriture
# échoue sur un mkdir refusé, et l'envoi d'un fichier ne marche pas du tout.
RUN mkdir -p /app/uploads && chown -R bunjs:slowpoke /app/uploads

USER bunjs

# Copy installed workspace
COPY --from=builder --chown=bunjs:slowpoke /app/server /app/server
COPY --from=builder --chown=bunjs:slowpoke /app/migrate /app/migrate
COPY --from=builder --chown=bunjs:slowpoke /app/seed /app/seed
COPY --from=pruner --chown=bunjs:slowpoke /app/out/full/packages/database/src/migrations /app/migrations

ENV DRIZZLE_MIGRATIONS_FOLDER=/app/migrations

# Commit de construction, exposé par /health et par l'OpenAPI.
#
# Sans lui, un consommateur ne peut pas vérifier quelle version répond : il doit croire
# l'exploitant sur parole. `docker compose build` le fournit via l'argument du même nom.
ARG GIT_COMMIT=inconnue
ENV GIT_COMMIT=$GIT_COMMIT

# Date de construction : deux abrégés de commit ne s'ordonnent pas, une date si.
ARG BUILD_DATE
ENV BUILD_DATE=$BUILD_DATE

EXPOSE 4000

CMD ["/app/server"]
