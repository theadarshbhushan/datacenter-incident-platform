FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# Development server. Production uses Dockerfile.prod (see docker-compose.prod.yml).
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
