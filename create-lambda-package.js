const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create a temporary directory for lambda package
const lambdaDir = path.join(__dirname, 'lambda-package');

console.log('Creating optimized Lambda package...');

// Clean up existing directory
if (fs.existsSync(lambdaDir)) {
  fs.rmSync(lambdaDir, { recursive: true });
}
fs.mkdirSync(lambdaDir);

// Copy essential files only
console.log('Copying essential files...');
execSync(`cp -r dist ${lambdaDir}/`);
execSync(`cp package.json ${lambdaDir}/`);

// Create a minimal package.json with only production dependencies
const originalPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const productionPackage = {
  name: originalPackage.name,
  version: originalPackage.version,
  main: originalPackage.main,
  dependencies: {
    // Only include runtime dependencies needed by Lambda
    "axios": originalPackage.dependencies.axios,
    "@aws-sdk/client-secrets-manager": originalPackage.dependencies["@aws-sdk/client-secrets-manager"],
    "@supabase/supabase-js": originalPackage.dependencies["@supabase/supabase-js"],
    "dotenv": originalPackage.dependencies.dotenv,
    "graphql-request": originalPackage.dependencies["graphql-request"],
    "graphql": originalPackage.dependencies.graphql,
    "uuid": originalPackage.dependencies.uuid
  }
};

fs.writeFileSync(
  path.join(lambdaDir, 'package.json'), 
  JSON.stringify(productionPackage, null, 2)
);

// Install only production dependencies in lambda directory
console.log('Installing minimal dependencies...');
process.chdir(lambdaDir);
execSync('npm install --production --silent');

// Create zip package
console.log('Creating zip package...');
process.chdir(__dirname);
execSync(`cd ${lambdaDir} && zip -r ../lambda-deployment.zip .`);

// Cleanup
fs.rmSync(lambdaDir, { recursive: true });

console.log('✅ Optimized Lambda package created: lambda-deployment.zip');

// Show package size
const stats = fs.statSync('lambda-deployment.zip');
console.log(`📦 Package size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);