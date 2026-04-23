FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Compilar TypeScript → dist/ (sigue outDir/rootDir del tsconfig)
RUN npx tsc

# ── Imagen final (solo runtime) ──────────────────────────────
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Copiar JS compilado
COPY --from=build /app/dist ./dist

EXPOSE 3000

# tsconfig rootDir="./" → entry queda en dist/src/index.js
CMD ["node", "dist/src/index.js"]
