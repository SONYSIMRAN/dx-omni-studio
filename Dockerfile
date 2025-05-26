FROM node:18

# Install SFDX CLI globally
RUN npm install -g sfdx-cli

# Install git (needed to clone Vlocity CLI)
RUN apt-get update && apt-get install -y git

# Clone and install Vlocity CLI globally
RUN git clone https://github.com/vlocityinc/vlocity_build.git && \
    cd vlocity_build && npm install && npm link

# Set working directory for your app
WORKDIR /app

# Copy app source code
COPY . .

# Install app dependencies
RUN npm install

# ⚠️ Add JWT key and login to Salesforce
# These env vars must be set in Railway: SF_JWT_KEY, SF_CLIENT_ID, SF_USERNAME, SF_LOGIN_URL
RUN echo "$SF_JWT_KEY" > jwt.key && \
    sfdx auth:jwt:grant \
      --clientid "$SF_CLIENT_ID" \
      --jwtkeyfile jwt.key \
      --username "$SF_USERNAME" \
      --instanceurl "$SF_LOGIN_URL" \
      --setalias trial1

# Expose app port
EXPOSE 3000

# Start your Node app
CMD ["node", "deployServer.js"]
