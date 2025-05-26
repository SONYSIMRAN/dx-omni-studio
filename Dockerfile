# Use official Node 18 image
FROM node:18

# Install Salesforce CLI
RUN npm install -g sfdx-cli

# Install Git (required for Vlocity CLI clone)
RUN apt-get update && apt-get install -y git

# Clone and install Vlocity CLI
RUN git clone https://github.com/vlocityinc/vlocity_build.git && \
    cd vlocity_build && npm install && npm link

# Set the working directory
WORKDIR /app

# Copy project files into the container
COPY . .

# Install app dependencies
RUN npm install

# Expose your app port
EXPOSE 3000

# Final runtime command:
# 1. Write JWT key from env
# 2. Authenticate to Salesforce using JWT
# 3. Run the Node.js deployment server
# CMD sh -c 'echo "$SF_JWT_KEY" > jwt.key && \
#     sfdx auth:jwt:grant \
#       --clientid "$SF_CLIENT_ID" \
#       --jwtkeyfile jwt.key \
#       --username "$SF_USERNAME" \
#       --instanceurl "$SF_LOGIN_URL" \
#       --setalias trial1 && \
#     node deployServer.js'

CMD sh -c 'echo "$SF_JWT_KEY" > jwt.key && \
    sfdx auth:jwt:grant --clientid "$SF_CLIENT_ID" --jwtkeyfile jwt.key --username "$SF_USERNAME" --instanceurl "$SF_LOGIN_URL" --setalias trial1 && \
    sfdx auth:list && \
    node deployServer.js'

