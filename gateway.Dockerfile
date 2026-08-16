FROM node:20-alpine

RUN apk add --no-cache docker-cli
WORKDIR /gateway
COPY gateway/package.json ./package.json
COPY gateway/package-lock.json ./package-lock.json
RUN npm ci --omit=dev
COPY gateway/server.js ./server.js

CMD ["node", "server.js"]
