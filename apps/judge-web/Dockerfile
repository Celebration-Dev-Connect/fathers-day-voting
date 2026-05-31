FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ARG VITE_PUBLIC_BASE_PATH
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PUBLIC_BASE_PATH=$VITE_PUBLIC_BASE_PATH
COPY package.json package-lock.json* ./
COPY apps/judge-web/package.json apps/judge-web/package.json
COPY packages/carshow-components/package.json packages/carshow-components/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm install
COPY tsconfig.base.json ./
COPY apps/judge-web apps/judge-web
COPY packages/carshow-components packages/carshow-components
RUN npm run build --workspace @carshow/carshow-components
RUN npm run build --workspace @carshow/judge-web

FROM nginx:1.27-alpine
COPY --from=build /app/apps/judge-web/dist /usr/share/nginx/html
EXPOSE 80
