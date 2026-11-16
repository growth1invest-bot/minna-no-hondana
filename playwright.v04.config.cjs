const base = require('./playwright.config.cjs');
module.exports = {
  ...base,
  testMatch: '**/v04.spec.cjs',
  webServer: {
    command: 'python3 -m http.server 8764 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8764/index-v04.html',
    reuseExistingServer: !process.env.CI
  }
};
