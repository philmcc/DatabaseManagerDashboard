#!/bin/bash

# Find and replace authentication console.log statements
echo "Fixing authentication logging..."

# Replace "Checking authentication:" logs
find ./server -type f -name "*.ts" -exec grep -l "console.log.*Checking authentication" {} \; | xargs sed -i '' -e 's/console.log.*Checking authentication.*)/\/\/ Authentication check/g'

# Replace "Authentication successful for user:" logs
find ./server -type f -name "*.ts" -exec grep -l "console.log.*Authentication successful for user" {} \; | xargs sed -i '' -e 's/console.log.*Authentication successful for user.*)/\/\/ User authenticated/g'

echo "Done! Check the files for any remaining console.log statements." 