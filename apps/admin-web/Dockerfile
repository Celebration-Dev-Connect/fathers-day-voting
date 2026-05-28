FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json* ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm install
COPY tsconfig.base.json ./
COPY apps/admin-web apps/admin-web
RUN npm run build --workspace @carshow/admin-web

FROM nginx:1.27-alpine
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html
EXPOSE 80
