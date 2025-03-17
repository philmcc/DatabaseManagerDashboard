#!/bin/bash

# Cleanup Stale Queries
# This script runs the cleanup utility for stale queries

echo "Starting query cleanup process..."

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js to run this script."
    exit 1
fi

# Get the retention days argument
RETENTION_DAYS=${1:-90}  # Default to 90 days if not provided

# Run the JavaScript script with the retention days
echo "Running cleanup with ${RETENTION_DAYS} days retention period..."
NODE_ENV=production node scripts/cleanup-stale-queries.js $RETENTION_DAYS

# Exit with the script's exit code
exit $? 