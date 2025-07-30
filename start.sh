#!/bin/sh

# echo "🔐 Authenticating with Salesforce..."
# echo "SF_CLIENT_ID: $SF_CLIENT_ID"
# echo "SF_USERNAME: $SF_USERNAME"

# # Write SF_JWT_KEY to server.key file
# echo "$SF_JWT_KEY" > /app/server.key
# chmod 600 /app/server.key

# # Authenticate with Salesforce
# sf auth:jwt:grant \
#   --client-id "$SF_CLIENT_ID" \
#   # --jwt-key-file /app/server.key \
#   --jwt-key-file "$SF_JWT_KEY" 
#   --username "$SF_USERNAME" \
#   --instance-url "$SF_LOGIN_URL" \
#   --alias trial1

# if [ $? -eq 0 ]; then
#   echo "✅ SF auth success"
# else
#   echo "⚠️ SF auth failed — continuing anyway"
# fi

echo "🚀 Starting Node server..."
node deployServer.js
