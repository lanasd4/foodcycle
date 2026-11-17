# syntax=docker/dockerfile:1
# FoodCycle web app — static build served by nginx, which also proxies the API.
#   docker build -f apps/web/Dockerfile -t foodcycle-web .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# unstable networks: retry downloads, and keep the npm cache between builds so a retry resumes
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --workspace @foodcycle/web --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npx --workspace @foodcycle/web vite build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
