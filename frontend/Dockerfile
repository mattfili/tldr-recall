# Recall web — static Vite build served by Caddy (issue #28, spec §12.2).
# Build context = frontend/ (the Railway service rootDirectory).
#
# VITE_API_BASE_URL is baked at BUILD time (Vite semantics). Railway exposes the
# service's variables as build args when declared with ARG below — set it on the
# web service to the API service's public URL.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_POSTHOG_KEY
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
# Railway injects PORT; the app is a single-page bundle with state-based views
# (no client-side routes), so a plain file server suffices.
CMD ["sh", "-c", "caddy file-server --root /srv --listen :${PORT:-8080}"]
