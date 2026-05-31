# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage — nginx:alpine serves the React build; nginx.conf mounted by docker-compose
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
