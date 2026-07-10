FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
  fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build

FROM base AS runner
COPY --from=base /app /app
EXPOSE 3000
CMD ["npm", "start"]
