const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to recursively find all TypeScript files
function findTsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findTsFiles(filePath, fileList);
    } else if (file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Process files and replace authentication logging
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace verbose authentication logging
  const replacements = [
    {
      pattern: /console\.log\(['"]Checking authentication:['"][\s\S]*?\);/g,
      replacement: '// Authentication check removed'
    },
    {
      pattern: /console\.log\(['"]Authentication successful for user:['"][\s\S]*?\);/g,
      replacement: '// Successful authentication logging removed'
    },
    {
      pattern: /console\.log\(['"]Fetching[\s\S]*?config for database['"]\s*,\s*.*\);/g,
      replacement: 'logger.debug(`Fetching config for database ${req.params.id}`);'
    }
  ];
  
  let modified = false;
  
  replacements.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      modified = true;
    }
  });
  
  if (modified) {
    console.log(`Modified: ${filePath}`);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

// Main function
function main() {
  console.log('Fixing authentication logging...');
  
  const serverDir = path.join(__dirname, '..');
  const tsFiles = findTsFiles(serverDir);
  
  let modifiedCount = 0;
  
  tsFiles.forEach(file => {
    try {
      processFile(file);
      modifiedCount++;
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  });
  
  console.log(`Done! Modified ${modifiedCount} files.`);
}

main(); 