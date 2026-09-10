FROM node:24-slim
ARG APP_RELEASE=unknown
ENV APP_RELEASE=$APP_RELEASE
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer poppler-utils tesseract-ocr fonts-liberation fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev
EXPOSE 3000
CMD ["node", "dist/index-pg.js"]
