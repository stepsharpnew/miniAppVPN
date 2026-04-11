FROM node:20-alpine AS webapp
WORKDIR /src
COPY bot/package.json bot/package-lock.json ./
RUN npm ci
COPY bot/ ./
RUN npm run webapp:build

FROM node:20-alpine AS website
WORKDIR /src
COPY website/package.json website/package-lock.json* ./
RUN npm install
COPY website/ ./
RUN npm run build

FROM nginx:stable-alpine
COPY --from=webapp /src/webapp/dist /usr/share/nginx/miniapp
COPY --from=website /src/dist /usr/share/nginx/website
