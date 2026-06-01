FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm install --include=optional

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/db packages/db
RUN npm run db:generate
RUN npm run build --workspace @carshow/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/prisma packages/db/prisma
COPY package.json package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 4000
# Entrypoint runs `prisma migrate deploy` (and optional seed) before the server.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
