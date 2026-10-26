FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# Development server. For production, run `npm run build` and serve dist/ behind the same
# origin as the API (or a reverse proxy that forwards /api to dc-backend).
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
