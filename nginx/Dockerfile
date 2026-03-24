# Статика Mini App внутри образа: на сервере не нужен npm и папка webapp/dist из git.
FROM node:20-alpine AS webapp
WORKDIR /src
COPY bot/package.json bot/package-lock.json ./
RUN npm ci
COPY bot/ ./
RUN npm run webapp:build

FROM nginx:stable-alpine
COPY --from=webapp /src/webapp/dist /usr/share/nginx/miniapp
