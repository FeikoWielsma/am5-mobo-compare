# Stage 1: Generate the data and rear I/O images from the committed workbook.
FROM python:3.11-slim AS data-builder
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY ["AM5 Motherboards Sheet (X870_X670_B850_B650_B840_A620).xlsx", "./"]
COPY loaders/ loaders/
COPY models/ models/
COPY services/ services/
COPY scripts/build_data.py scripts/build_data.py
COPY static/img/boards/ static/img/boards/
COPY pyproject.toml ./
RUN mkdir -p web/static web/src/lib/data && python scripts/build_data.py

# Stage 2: Build static web app
FROM node:22-alpine AS builder
WORKDIR /app/web

# Install pnpm matching lockfile format
RUN npm install -g pnpm@10

# Copy package files and install dependencies
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source code and build static assets
COPY web/ ./
COPY --from=data-builder /app/web/static/ ./static/
COPY --from=data-builder /app/web/src/lib/data/build_meta.json ./src/lib/data/build_meta.json
RUN pnpm run build && node scripts/check-build.mjs

# Stage 3: Serve with Caddy
FROM caddy:2-alpine
COPY --from=builder /app/web/build /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile

ENV PORT=8080
EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
