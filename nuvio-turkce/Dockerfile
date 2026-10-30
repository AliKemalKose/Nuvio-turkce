FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY data/ ./data/
EXPOSE 7000
CMD ["node", "server.js"]
