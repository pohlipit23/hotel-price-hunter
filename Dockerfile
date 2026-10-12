FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY app ./app
COPY fixtures/jury-booking.json ./fixtures/jury-booking.json
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
CMD ["node", "app/server.mjs"]
