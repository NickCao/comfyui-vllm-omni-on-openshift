FROM node:22-slim AS build
WORKDIR /app
COPY portal/package.json portal/package-lock.json ./
RUN npm ci
COPY portal/tsconfig.json portal/vite.config.ts ./
COPY portal/src/ src/
RUN npx tsc && npx vite build

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
    curl -fsSL https://get.helm.sh/helm-v3.17.3-linux-amd64.tar.gz | tar xz -C /usr/local/bin --strip-components=1 linux-amd64/helm && \
    apt-get remove -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY portal/package.json portal/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/server/ dist/server/
COPY --from=build /app/public/ public/
COPY charts/comfyui/ charts/comfyui/
EXPOSE 3000
USER 1001
CMD ["node", "dist/server/index.js"]
