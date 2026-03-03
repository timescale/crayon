FROM node:22-bookworm-slim

# Install flyctl
RUN apt-get update && apt-get install -y curl && \
    curl -L https://fly.io/install.sh | sh && \
    apt-get remove -y curl && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*
ENV FLYCTL_INSTALL="/root/.fly"
ENV PATH="$FLYCTL_INSTALL/bin:$PATH"

WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN pnpm install
COPY . .

# NEXT_PUBLIC_* vars must be present at build time to be inlined into client JS
ARG NEXT_PUBLIC_GITHUB_CLIENT_ID
ENV NEXT_PUBLIC_GITHUB_CLIENT_ID=$NEXT_PUBLIC_GITHUB_CLIENT_ID

RUN pnpm build

# Standalone output needs static assets copied alongside server.js
RUN cp -r .next/static .next/standalone/.next/static

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
