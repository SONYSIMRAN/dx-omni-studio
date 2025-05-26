FROM node:18

# Optional: install SFDX CLI (only if needed)
RUN npm install -g sfdx-cli

# Install git (required to clone vlocity repo)
RUN apt-get update && apt-get install -y git

# Clone and install vlocity CLI globally
RUN git clone https://github.com/vlocityinc/vlocity_build.git && \
    cd vlocity_build && npm install && npm link

# Set working directory for app
WORKDIR /app

# Copy your project files
COPY . .

# Install app dependencies
RUN npm install

# Expose port
EXPOSE 3000

# Start your app
CMD ["node", "deployServer.js"]
