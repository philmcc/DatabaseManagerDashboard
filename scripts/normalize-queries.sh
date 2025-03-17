#!/bin/bash

# Normalize Existing Queries
# This script runs the query normalization process

echo "Starting query normalization process..."
echo "This will normalize all existing SQL queries in the database to handle varying parameter counts"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js to run this script."
    exit 1
fi

# Run the JavaScript implementation
echo "Running the normalization process..."
NODE_ENV=production node scripts/normalize-queries.js

# Exit with the script's exit code
exit $? 