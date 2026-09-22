# Stage 1: Build static web app
FROM node:22-alpine AS builder
WORKDIR /app/web

# Install pnpm matching lockfile format
RUN npm install -g pnpm@10

# Copy package files and install dependencies
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source code and build static assets
COPY web/ ./
RUN pnpm run build

# Stage 2: Serve with Caddy
FROM caddy:2-alpine
COPY --from=builder /app/web/build /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile

ENV PORT=8080
EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
