# Use official Node 18 image
FROM node:18

# Install Git (required for cloning Vlocity)
RUN apt-get update && apt-get install -y git

# Install SF CLI (latest stable)
RUN npm install --global @salesforce/cli

# Clone and install Vlocity CLI
RUN git clone https://github.com/vlocityinc/vlocity_build.git && \
    cd vlocity_build && npm install && npm link

# Set working directory
WORKDIR /app

# Copy your project files
COPY . .

# Install project dependencies
RUN npm install

# Set environment variable to ensure SF CLI uses correct behavior
ENV SF_USE_PROGRESS_BAR=false

# Expose app port
EXPOSE 3000

# Runtime command:
# 1. Save private key from env
# 2. Authenticate to Salesforce via JWT
# 3. Start your deployment server
CMD sh -c 'echo "$SF_JWT_KEY" > jwt.key && \
    sf auth:jwt:grant \
      --client-id "$SF_CLIENT_ID" \
      --jwt-key-file jwt.key \
      --username "$SF_USERNAME" \
      --instance-url "$SF_LOGIN_URL" \
      --alias trial1 && \
    sf org list && \
    node deployServer.js'
