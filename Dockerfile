# Use official Node 18 image
FROM node:18

# Install Git and other dependencies
RUN apt-get update && apt-get install -y git

# Install Salesforce CLI
RUN npm install --global @salesforce/cli

# Clone and install Vlocity Build Tool
RUN git clone https://github.com/vlocityinc/vlocity_build.git && \
    cd vlocity_build && npm install && npm link

# Set working directory
WORKDIR /app

# Copy app source code
COPY . .

# Install Node.js dependencies
RUN npm cache clean --force && npm install --legacy-peer-deps

# Write key file from env at runtime (handled in deployServer.js)
# No longer copying static server.key directly here

# Disable SF CLI progress bar
ENV SF_USE_PROGRESS_BAR=false

# Expose for Cloud Run
EXPOSE 8080

# Start the app
CMD ["node", "deployServer.js"]
