FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm install

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
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/api/node_modules apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules packages/db/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/prisma packages/db/prisma
COPY package.json package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
