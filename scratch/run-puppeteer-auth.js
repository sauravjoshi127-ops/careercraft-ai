const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Starting Puppeteer Login & Theme Persistence Integration Test...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Listen for console logs inside the page
  page.on('console', msg => {
    console.log(`[PAGE CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  try {
    const testEmail = 'confirmed_test_user@example.com';
    const testPassword = 'Password123!';

    console.log(`\n1. Navigating to login page...`);
    await page.goto('http://localhost:3000/login.html', { waitUntil: 'networkidle2' });

    console.log('2. Filling out the Login form...');
    await page.type('#email', testEmail);
    await page.type('#password', testPassword);

    console.log('3. Submitting login form...');
    await Promise.all([
      page.click('#submitBtn'),
      new Promise(resolve => setTimeout(resolve, 4000))
    ]);

    let currentUrl = page.url();
    console.log(`\n4. URL after login submission: ${currentUrl}`);

    if (currentUrl.includes('dashboard.html')) {
      console.log('✅ SUCCESS: Redirected to dashboard.html!');
    } else {
      const bodyText = await page.evaluate(() => document.body.innerHTML);
      console.log('Body contents:', bodyText);
      throw new Error('Login redirect failed');
    }

    // Wait another 2 seconds to make sure it doesn't loop back to login/signup
    console.log('Waiting 2 seconds to check for redirect loops...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    currentUrl = page.url();
    console.log(`URL after waiting: ${currentUrl}`);
    if (currentUrl.includes('login.html') || currentUrl.includes('signup.html')) {
      throw new Error('❌ FAILURE: Redirect loop detected! User was kicked back to auth pages.');
    } else {
      console.log('✅ SUCCESS: Auth state remains stable on dashboard (no loops).');
    }

    // Check localStorage items
    const storageObj = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        items[key] = localStorage.getItem(key);
      }
      return items;
    });
    console.log('\n5. Current localStorage items:', storageObj);
    
    // Check if Supabase auth keys are present and separate from workspace key
    const hasSbKeys = Object.keys(storageObj).some(key => key.startsWith('sb-'));
    if (hasSbKeys) {
      console.log('✅ SUCCESS: Supabase tokens found in localStorage.');
    } else {
      throw new Error('❌ No sb- tokens found in localStorage (auth state missing).');
    }
    
    const workspaceVal = storageObj['careercraft_workspace'] || 'ai';
    console.log(`Selected workspace preference: ${workspaceVal}`);

    // Test Workspace Switcher
    console.log('\n6. Testing Workspace Switcher...');
    const hasSwitcher = await page.evaluate(() => !!document.getElementById('global-workspace-switcher'));
    if (!hasSwitcher) {
      throw new Error('❌ Switcher button not found on dashboard');
    }
    console.log('Clicking switcher...');
    await page.click('#global-workspace-switcher');
    
    // Wait for animated transition (350ms scale + 150ms delay)
    await new Promise(resolve => setTimeout(resolve, 800));

    // Verify workspace change inside page
    const updatedState = await page.evaluate(() => {
      return {
        workspace: localStorage.getItem('careercraft_workspace'),
        manualClass: document.body.classList.contains('theme-manual-active')
      };
    });
    console.log('Updated workspace state:', updatedState);
    if (updatedState.workspace === 'manual' && updatedState.manualClass) {
      console.log('✅ SUCCESS: Workspace switched to manual and theme class applied.');
    } else {
      throw new Error('❌ Switcher failed to update workspace state or apply theme');
    }

    // Refresh page to check theme persistence and session preservation
    console.log('\n7. Refreshing dashboard page...');
    await page.reload({ waitUntil: 'networkidle2' });
    
    // Wait to resolve any async auth check
    await new Promise(resolve => setTimeout(resolve, 2000));

    const finalState = await page.evaluate(() => {
      return {
        url: window.location.href,
        workspace: localStorage.getItem('careercraft_workspace'),
        manualClass: document.body.classList.contains('theme-manual-active'),
        hasSbKeys: Object.keys(localStorage).some(key => key.startsWith('sb-'))
      };
    });
    console.log('State after page refresh:', finalState);

    if (finalState.url.includes('dashboard.html') && finalState.workspace === 'manual' && finalState.manualClass && finalState.hasSbKeys) {
      console.log('\n🎉 ALL CHECKS PASSED SUCCESSFULLY! The regression is fully fixed! 🎉');
    } else {
      throw new Error('❌ Session or workspace theme did not persist after refresh');
    }

  } catch (err) {
    console.error('\n❌ Test failed with error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
    console.log('Test browser closed.');
  }
})();
