FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    DB_FILE=/app/data/reviews.db \
    BACKUP_DIR=/app/data/backups
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
# No VOLUME line: Railway rejects it. Mount a volume at /app/data instead
# (Railway: Settings -> Volumes; docker-compose.yml already does).
RUN mkdir -p /app/data && chown node:node /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/healthz" >/dev/null || exit 1
# Starts as root only to take ownership of the data volume, then switches to
# the unprivileged "node" user (see src/privileges.js).
CMD ["node", "--no-warnings=ExperimentalWarning", "src/server.js"]
