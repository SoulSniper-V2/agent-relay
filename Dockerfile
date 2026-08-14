FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY skills ./skills
ENV NODE_ENV=production
ENV RELAY_PORT=8787
ENV RELAY_DB=/data/hub.db
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "--experimental-sqlite", "--import", "tsx", "src/serve.ts"]
