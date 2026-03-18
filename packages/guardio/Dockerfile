FROM node:20-slim

WORKDIR /app

# Install only production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy compiled sources and CLI entrypoint
COPY dist ./dist
COPY bin ./bin

ENV NODE_ENV=production
EXPOSE 3939

# Default: start Guardio HTTP server.
# You can pass extra CLI args, e.g.:
#   docker run image-name --config /config/guardio.config.json
ENTRYPOINT ["node", "bin/guardio.mjs"]
CMD []

