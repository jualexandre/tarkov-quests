FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/prod.db"
ENV PORT=3000
COPY --from=build /app/package.json /app/package-lock.json ./
# Full npm ci (not --omit=dev): prisma CLI and dotenv are devDependencies but required at runtime boot (see CMD below).
RUN npm ci
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && node dist/server.js"]
