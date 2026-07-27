'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('Universal Clipboard Utility (appSdk.ui.copyToClipboard)', () => {
  let originalClipboard;

  beforeEach(() => {
    // Setup mock browser environment globals safely
    global.window = global.window || {};
    
    // Safely redefine navigator.clipboard
    const mockNavigator = {
      clipboard: {
        writeText: async () => true
      }
    };
    try {
      Object.defineProperty(global, 'navigator', {
        value: mockNavigator,
        writable: true,
        configurable: true
      });
    } catch (e) {
      global.navigator.clipboard = mockNavigator.clipboard;
    }

    global.document = {
      createElement: () => ({
        style: {},
        setAttribute: () => {},
        focus: () => {},
        select: () => {},
        setSelectionRange: () => {}
      }),
      body: {
        appendChild: () => {},
        removeChild: () => {}
      },
      execCommand: () => true,
      activeElement: null
    };

    // Load app-sdk.js
    delete require.cache[require.resolve('../app-sdk.js')];
    require('../app-sdk.js');
  });

  afterEach(() => {
    delete global.window.copyToClipboard;
    delete global.window.appSdk;
  });

  it('exposes window.copyToClipboard and appSdk.ui.copyToClipboard', () => {
    assert.strictEqual(typeof global.window.copyToClipboard, 'function');
    assert.strictEqual(typeof global.window.appSdk.ui.copyToClipboard, 'function');
  });

  it('copies text successfully via navigator.clipboard.writeText', async () => {
    let copiedText = '';
    let toastMessage = '';
    let toastType = '';

    global.navigator.clipboard = {
      writeText: async (text) => {
        copiedText = text;
        return true;
      }
    };

    global.window.appSdk.ui.showToast = (msg, type) => {
      toastMessage = msg;
      toastType = type;
    };

    const result = await global.window.copyToClipboard('Hello World', 'Copied text!');
    assert.strictEqual(result, true);
    assert.strictEqual(copiedText, 'Hello World');
    assert.strictEqual(toastMessage, 'Copied text!');
    assert.strictEqual(toastType, 'success');
  });

  it('falls back gracefully to document.execCommand when navigator.clipboard fails', async () => {
    let execCommandCalled = false;

    global.navigator.clipboard = {
      writeText: async () => {
        throw new Error('Permission denied');
      }
    };

    global.document.execCommand = (cmd) => {
      if (cmd === 'copy') execCommandCalled = true;
      return true;
    };

    const result = await global.window.copyToClipboard('Fallback text', 'Fallback succeeded');
    assert.strictEqual(result, true);
    assert.strictEqual(execCommandCalled, true);
  });

  it('returns false and displays error toast when text is empty', async () => {
    let toastType = '';
    let toastMsg = '';

    global.window.appSdk.ui.showToast = (msg, type) => {
      toastMsg = msg;
      toastType = type;
    };

    const result = await global.window.copyToClipboard('');
    assert.strictEqual(result, false);
    assert.strictEqual(toastType, 'error');
    assert.strictEqual(toastMsg, 'Nothing to copy.');
  });

  it('respects options object { successMessage, showToast: false }', async () => {
    let toastCalled = false;

    global.navigator.clipboard = {
      writeText: async () => true
    };

    global.window.appSdk.ui.showToast = () => {
      toastCalled = true;
    };

    const result = await global.window.copyToClipboard('Silent text', {
      successMessage: 'Silent Copy',
      showToast: false
    });

    assert.strictEqual(result, true);
    assert.strictEqual(toastCalled, false);
  });
});
