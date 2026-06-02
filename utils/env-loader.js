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
  for (const envPath of potentialPaths) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      console.log(`[EnvLoader] Loaded environment variables from: ${envPath}`);
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    console.warn('[EnvLoader] Warning: No .env file found in any of the expected locations.');
  }

  global.__envLoaded = true;
}
