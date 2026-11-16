const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.cjs',
  reporter: 'list',
  use: { headless: true, baseURL: 'http://127.0.0.1:8764' },
  webServer: { command: 'python3 -m http.server 8764 --bind 127.0.0.1', url: 'http://127.0.0.1:8764', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'phone-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'tablet-chromium', use: { browserName: 'chromium', viewport: { width: 810, height: 1080 }, isMobile: true, hasTouch: true } },
    { name: 'small-chromium', use: { browserName: 'chromium', viewport: { width: 320, height: 700 } } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'ipad-webkit', use: { ...devices['iPad (gen 7)'], browserName: 'webkit' } }
  ]
});
