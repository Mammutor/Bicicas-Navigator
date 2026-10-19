# Static site used by GitHub Pages and by the local nginx image.
# Pages export: docker buildx build --target export -o type=local,dest=./site .
# Local server: docker build -t bicicas . && docker run --rm -p 8080:80 bicicas

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM scratch AS export
COPY --from=build /app/dist /

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
