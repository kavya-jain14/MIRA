FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app
COPY --from=build /app /app

EXPOSE 3000
CMD ["npm", "run", "start:api"]
