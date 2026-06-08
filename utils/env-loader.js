const fs = require('fs');
const path = require('path');

// Prevent double execution
if (!global.__envLoaded) {
  const potentialPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../../.env')
  ];

  let loaded = false;
  let loadedPath = null;
  for (const envPath of potentialPaths) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      loadedPath = envPath;
      loaded = true;
      break;
    }
  }

  // Safe diagnostics log (suppressed partially in tests to avoid test output noise, but active in development)
  const isTest = process.env.NODE_ENV === 'test';
  
  if (!isTest) {
    console.log('\n==================================================');
    console.log('[EnvLoader] Runtime Environment Diagnostics:');
    console.log(`  - process.cwd(): ${process.cwd()}`);
    console.log(`  - __dirname:     ${__dirname}`);
    if (loaded) {
      console.log(`  - Env Source:    Loaded .env from ${loadedPath}`);
    } else {
      console.log('  - Env Source:    No local .env file located (resolving from parent/system variables)');
    }
    console.log('[EnvLoader] Active Environment Resolution Table:');
    
    const printKeyInfo = (name) => {
      const val = process.env[name];
      if (val) {
        console.log(`    - ${name}: RESOLVED (Length: ${val.length})`);
      } else {
        console.log(`    - ${name}: UNDEFINED`);
      }
    };

    printKeyInfo('GEMINI_API_KEY');
    printKeyInfo('GEMINI_API_KEYS');
    
    let geminiIndexedCount = 0;
    for (let i = 1; i <= 10; i++) {
      if (process.env[`GEMINI_API_KEY_${i}`]) {
        geminiIndexedCount++;
      }
    }
    if (geminiIndexedCount > 0) {
      console.log(`    - GEMINI_API_KEY_1..10: RESOLVED (${geminiIndexedCount} indexed keys found)`);
    } else {
      console.log('    - GEMINI_API_KEY_1..10: UNDEFINED');
    }

    printKeyInfo('SUPABASE_URL');
    printKeyInfo('SUPABASE_ANON_KEY');
    printKeyInfo('SUPABASE_SERVICE_ROLE_KEY');
    console.log('==================================================\n');
  } else {
    // Log minimal message for tests
    if (loaded) {
      console.log(`[EnvLoader] Loaded environment variables from: ${loadedPath}`);
    } else {
      console.warn('[EnvLoader] Warning: No .env file found in any of the expected locations.');
    }
  }

  global.__envLoaded = true;
}
