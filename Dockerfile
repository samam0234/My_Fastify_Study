FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data/uploads /data/outbox && chown -R node:node /app /data
USER node
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SQLITE_PATH=/data/board.db
ENV UPLOAD_DIR=/data/uploads
ENV OUTBOX_DIR=/data/outbox
EXPOSE 3000
CMD ["node", "src/server.js"]
