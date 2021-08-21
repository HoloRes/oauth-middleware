# Select NodeJS 16 Alpine image, alpine for smaller size
FROM node:16-alpine

# For Sentry release tracking
ARG sha
ENV COMMIT_SHA=$sha

ENV NODE_ENV=production

# Create a temporary directory for build
WORKDIR /tmp
COPY package.json .
COPY package-lock.json .

# Install packages
RUN npm ci --also=dev

# Copy remaining files except files in .dockerignore
COPY . .

# Compile to TS
RUN npm run build

# Copy dist and only install production packages
WORKDIR /app

COPY package.json .
COPY package-lock.json .
RUN npm ci

RUN cp -r /tmp/dist/* . \
    && rm -rf /tmp


# Set start command
CMD ["node", "index.js", "--trace-events-enabled", "--trace-warnings"]
