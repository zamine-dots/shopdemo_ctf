FROM node:20-alpine

# git is needed only at image-build time in case organizers want to
# regenerate git-source/ (see git-source/README-ORGANIZER.md). Not required
# at runtime, but harmless to keep for debugging inside the container.
RUN apk add --no-cache git

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public
COPY git-source ./git-source

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/server.js"]
