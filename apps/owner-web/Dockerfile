FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ARG VITE_PUBLIC_BASE_PATH
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PUBLIC_BASE_PATH=$VITE_PUBLIC_BASE_PATH
COPY package.json package-lock.json* ./
COPY apps/owner-web/package.json apps/owner-web/package.json
COPY packages/carshow-components/package.json packages/carshow-components/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm install --include=optional && npm install --no-save @rollup/rollup-linux-x64-musl@4.60.4
COPY tsconfig.base.json ./
COPY apps/owner-web apps/owner-web
COPY packages/carshow-components packages/carshow-components
RUN npm run build --workspace @carshow/carshow-components
RUN npm run build --workspace @carshow/owner-web

FROM nginx:1.27-alpine
COPY --from=build /app/apps/owner-web/dist /usr/share/nginx/html
EXPOSE 80
