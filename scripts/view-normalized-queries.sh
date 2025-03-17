#!/bin/bash

# View Normalized Queries
# This script runs the normalized query viewer

echo "Starting normalized query viewer..."

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js to run this script."
    exit 1
fi

# Run the JavaScript script
NODE_ENV=production node scripts/view-normalized-queries.js

# Exit with the script's exit code
exit $? 