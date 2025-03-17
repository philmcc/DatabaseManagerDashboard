#!/bin/bash

# Create Query Monitoring Tables
# This script creates the new tables for query monitoring

echo "Starting table creation process..."

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js to run this script."
    exit 1
fi

# Run the JavaScript script
echo "Creating tables..."
NODE_ENV=production node scripts/create-query-monitoring-tables.js

# Exit with the script's exit code
exit $? 