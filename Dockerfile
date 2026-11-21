# One container: SvelteKit adapter-node. Database is Neon Postgres (DATABASE_URL); no volume.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN PUPPETEER_SKIP_DOWNLOAD=1 pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-slim
WORKDIR /app
# 384 MB heap = 75% of the 512 MB machine; measured production-path RSS 130 MB (2026-11-21).
ENV NODE_ENV=production PORT=3000 APP_DB_ROLE=books_app NODE_OPTIONS=--max-old-space-size=384
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/fixtures ./fixtures
COPY processes.yaml package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
