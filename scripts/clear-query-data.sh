#!/bin/bash

# Clear Query Monitoring Data
# This script safely removes all query monitoring data to provide a fresh start

echo "Starting query data cleanup process..."

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js to run this script."
    exit 1
fi

# Run the JavaScript script
echo "Running data cleanup script..."
NODE_ENV=production node scripts/clear-query-data.js

# Exit with the script's exit code
exit $? 