FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
RUN npm ci --omit=dev --workspace @mentor-simulator/server

COPY apps/server apps/server

EXPOSE 4310

CMD ["node", "apps/server/src/index.js"]
