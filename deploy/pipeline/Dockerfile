FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ARG SOURCE_REVISION=local
LABEL org.opencontainers.image.source="https://github.com/JakeSiddall/workoutTracker" \
      org.opencontainers.image.revision=$SOURCE_REVISION
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 WORKOUT_DB=/data/workouts.sqlite
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER 1000:1000
EXPOSE 3001
CMD ["node", "server/index.js"]
