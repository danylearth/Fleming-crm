FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc
RUN cp -R src/email-templates dist/email-templates
RUN cp -R src/agreement-assets dist/agreement-assets
EXPOSE 3000
CMD ["node", "dist/index-pg.js"]
