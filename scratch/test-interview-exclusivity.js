const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Starting Puppeteer Interview Coach Exclusivity Integration Test...');
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

    console.log('\n1. Navigating to login page...');
    await page.goto('http://localhost:3000/login.html', { waitUntil: 'networkidle2' });

    console.log('2. Logging in...');
    await page.type('#email', testEmail);
    await page.type('#password', testPassword);
    await Promise.all([
      page.click('#submitBtn'),
      new Promise(resolve => setTimeout(resolve, 4000))
    ]);

    let currentUrl = page.url();
    console.log(`URL after login: ${currentUrl}`);
    if (!currentUrl.includes('dashboard.html')) {
      throw new Error('❌ Login failed or redirect to dashboard did not occur.');
    }

    console.log('\n3. Setting workspace to Creator Studio...');
    const activeWorkspace = await page.evaluate(() => localStorage.getItem('careercraft_workspace') || 'ai');
    console.log(`Initial workspace: ${activeWorkspace}`);
    
    if (activeWorkspace === 'ai') {
      console.log('Clicking switcher to activate Creator Studio (manual)...');
      await page.click('#global-workspace-switcher');
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    const wsVal = await page.evaluate(() => localStorage.getItem('careercraft_workspace'));
    console.log(`Active workspace is now: ${wsVal}`);
    if (wsVal !== 'manual') {
      throw new Error('❌ Failed to switch to Creator Studio (manual).');
    }

    console.log('\n4. Checking navigation bar links inside Creator Studio...');
    const navLinksTexts = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('#navLinksContainer a'));
      return links.map(l => l.textContent.trim());
    });
    console.log('Navigation links found:', navLinksTexts);

    if (navLinksTexts.includes('Interview Coach')) {
      throw new Error('❌ FAILURE: "Interview Coach" was found in Creator Studio navigation links.');
    } else {
      console.log('✅ SUCCESS: "Interview Coach" is NOT present in Creator Studio navigation links.');
    }

    console.log('\n5. Manually navigating to interview.html while Creator Studio is active...');
    await page.goto('http://localhost:3000/interview.html', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Verifying overlay presence on interview.html...');
    const overlayState = await page.evaluate(() => {
      const overlay = document.getElementById('exclusive-interview-overlay');
      if (!overlay) return { exists: false };
      return {
        exists: true,
        visible: window.getComputedStyle(overlay).display !== 'none',
        titleText: overlay.querySelector('.exclusive-feature-title')?.textContent.trim(),
        btnText: overlay.querySelector('#btn-switch-to-ai-studio')?.textContent.trim()
      };
    });

    console.log('Overlay State:', overlayState);
    if (!overlayState.exists || !overlayState.visible) {
      throw new Error('❌ FAILURE: Transition overlay was not displayed or not visible on interview.html in Creator Studio.');
    }
    
    console.log('✅ SUCCESS: Transition overlay is displayed and visible.');
    assertMatch(overlayState.titleText, /available exclusively in AI Studio/i);
    assertMatch(overlayState.btnText, /Switch to AI Studio/i);

    console.log('\n6. Clicking "Switch to AI Studio" button...');
    await page.click('#btn-switch-to-ai-studio');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const finalState = await page.evaluate(() => {
      const overlay = document.getElementById('exclusive-interview-overlay');
      return {
        workspace: localStorage.getItem('careercraft_workspace'),
        overlayVisible: overlay ? window.getComputedStyle(overlay).display !== 'none' : false
      };
    });

    console.log('Final State after switching:', finalState);
    if (finalState.workspace !== 'ai') {
      throw new Error(`❌ FAILURE: Workspace state is not "ai" (actual: ${finalState.workspace})`);
    }
    if (finalState.overlayVisible) {
      throw new Error('❌ FAILURE: Transition overlay is still visible after switching workspace to AI Studio.');
    }

    console.log('✅ SUCCESS: Workspace successfully switched to AI Studio, and overlay is now hidden.');

    console.log('\n🎉 ALL INTERVIEW EXCLUSIVITY CHECKS PASSED SUCCESSFULLY! 🎉');

  } catch (err) {
    console.error('\n❌ Test failed with error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
    console.log('Test browser closed.');
  }
})();

function assertMatch(val, regex) {
  if (!regex.test(val)) {
    throw new Error(`Value "${val}" does not match pattern ${regex}`);
  }
}
