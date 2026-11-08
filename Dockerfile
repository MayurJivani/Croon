# Build the web app, then run the server straight from TypeScript (Node strips types natively).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache tini
ENV NODE_ENV=production PORT=4398
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/data ./data
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 4398
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:4398/health >/dev/null || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "node apps/server/src/db/migrate.ts && node apps/server/src/index.ts"]
