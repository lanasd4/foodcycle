# syntax=docker/dockerfile:1
# FoodCycle API — production image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t foodcycle-api .
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
    npm ci --workspace @foodcycle/api --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @foodcycle/api && npm prune --omit=dev --workspace @foodcycle/api

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# packages/shared is TypeScript source, run through Node's built-in type stripping (Node >= 22.18)
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3000
# migrations run automatically on start
CMD ["node", "dist/main.js"]
