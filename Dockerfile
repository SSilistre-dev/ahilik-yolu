FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY . .
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/index.js"]
