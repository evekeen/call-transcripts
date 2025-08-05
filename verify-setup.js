#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Multi-Platform Sales Intelligence Setup...');
console.log('=====================================================\n');

// Check Node.js version
console.log('1️⃣ Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion >= 18) {
  console.log(`   ✅ Node.js ${nodeVersion} (>= 18.0.0)`);
} else {
  console.log(`   ❌ Node.js ${nodeVersion} (requires >= 18.0.0)`);
}
console.log('');

// Check package.json and dependencies
console.log('2️⃣ Checking project structure...');
const requiredFiles = [
  'package.json',
  '.env.example', 
  'src/integrations/gong/gongClient.ts',
  'src/integrations/clari/clariClient.ts',
  'src/integrations/fireflies/firefliesClient.ts',
  'src/database/repositories/transcriptRepository.ts',
  'src/services/accountAssociation.ts',
  'infrastructure/cdk/gongIntegrationStack.ts'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} (missing)`);
  }
});
console.log('');

// Check if dependencies are installed
console.log('3️⃣ Checking dependencies...');
if (fs.existsSync('node_modules')) {
  console.log('   ✅ node_modules directory exists');
  
  // Check key dependencies
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = [
    '@supabase/supabase-js',
    '@aws-sdk/client-sqs',
    'axios',
    'graphql-request',
    'jest'
  ];
  
  const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  requiredDeps.forEach(dep => {
    if (allDeps[dep]) {
      console.log(`   ✅ ${dep} (${allDeps[dep]})`);
    } else {
      console.log(`   ❌ ${dep} (missing - run npm install)`);
    }
  });
} else {
  console.log('   ❌ node_modules directory missing - run npm install');
}
console.log('');

// Check environment configuration
console.log('4️⃣ Checking environment configuration...');
if (fs.existsSync('.env')) {
  console.log('   ✅ .env file exists');
  
  const envContent = fs.readFileSync('.env', 'utf8');
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'GONG_CLIENT_ID',
    'CLARI_API_TOKEN', 
    'FIREFLIES_API_KEY'
  ];
  
  requiredEnvVars.forEach(envVar => {
    if (envContent.includes(`${envVar}=`) && !envContent.includes(`${envVar}=your-`)) {
      console.log(`   ✅ ${envVar} is configured`);
    } else {
      console.log(`   ⚠️  ${envVar} needs to be configured`);
    }
  });
} else {
  console.log('   ❌ .env file missing - copy from .env.example');
}
console.log('');

// Check TypeScript compilation
console.log('5️⃣ Checking TypeScript compilation...');
if (fs.existsSync('dist')) {
  console.log('   ✅ dist directory exists (TypeScript compiled)');
} else {
  console.log('   ⚠️  dist directory missing - run npm run build');
}
console.log('');

// Check test files
console.log('6️⃣ Checking test coverage...');
const testFiles = [
  'src/integrations/gong/gongClient.test.ts',
  'src/integrations/clari/clariClient.test.ts', 
  'src/integrations/fireflies/firefliesClient.test.ts',
  'src/database/repositories/transcriptRepository.test.ts',
  'src/services/accountAssociation.test.ts'
];

let testCount = 0;
testFiles.forEach(testFile => {
  if (fs.existsSync(testFile)) {
    console.log(`   ✅ ${testFile}`);
    testCount++;
  } else {
    console.log(`   ❌ ${testFile} (missing)`);
  }
});
console.log(`   📊 ${testCount}/${testFiles.length} test files found`);
console.log('');

// Summary and next steps
console.log('=====================================================');
console.log('📋 Setup Verification Summary');
console.log('=====================================================');
console.log('');

console.log('✅ Ready to proceed if all items above are green');
console.log('');

console.log('🚀 Quick Start Commands:');
console.log('   npm install          # Install dependencies');
console.log('   cp .env.example .env # Copy environment template');
console.log('   npm run build        # Compile TypeScript');  
console.log('   npm test             # Run unit tests');
console.log('   node test-e2e.js     # Run end-to-end tests');
console.log('');

console.log('🔧 Configuration Steps:');
console.log('   1. Edit .env with your API credentials');
console.log('   2. Set up Supabase database (copy SQL from src/database/schemas/transcript.ts)');
console.log('   3. Configure AWS CLI for deployment (optional)');
console.log('   4. Set up webhook endpoints in each platform');
console.log('');

console.log('📚 Documentation:');
console.log('   README.md            # Complete setup guide');
console.log('   Architecture diagram # See README.md');
console.log('   API documentation    # Platform-specific docs in src/integrations/*/types.ts');
console.log('');

console.log('❓ Need help? Check the troubleshooting section in README.md');