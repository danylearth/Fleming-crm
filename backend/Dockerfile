FROM node:24-slim
ARG APP_RELEASE=unknown
ENV APP_RELEASE=$APP_RELEASE
RUN sed -i 's/Components: main/Components: main contrib/' /etc/apt/sources.list.d/debian.sources && apt-get update && echo 'ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true' | debconf-set-selections && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates unzip libreoffice-writer poppler-utils tesseract-ocr fonts-liberation fonts-dejavu-core ttf-mscorefonts-installer && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev
EXPOSE 3000
CMD ["node", "dist/index-pg.js"]
