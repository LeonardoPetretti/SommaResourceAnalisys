# ====== Stage 1: build ======
FROM node:20-alpine AS builder

WORKDIR /app

# Build-args com as variáveis do Vite (precisam estar disponíveis em build-time)
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID
ARG VITE_BOOTSTRAP_ADMIN_EMAIL
ARG VITE_USE_EMULATORS=false

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID \
    VITE_BOOTSTRAP_ADMIN_EMAIL=$VITE_BOOTSTRAP_ADMIN_EMAIL \
    VITE_USE_EMULATORS=$VITE_USE_EMULATORS

# Instala deps com cache
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copia o resto e builda
COPY . .
RUN npm run build

# ====== Stage 2: runtime (nginx) ======
FROM nginx:1.27-alpine

# Substitui a config padrão por uma que suporta SPA + porta 8080 (Cloud Run)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia o build estático
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

# Cloud Run injeta $PORT; nginx escuta na 8080 (default)
CMD ["nginx", "-g", "daemon off;"]
