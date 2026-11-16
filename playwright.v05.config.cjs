const base = require('./playwright.config.cjs');
module.exports = {
  ...base,
  testMatch: '**/v05.test.cjs',
  use: {...base.use, baseURL: 'http://127.0.0.1:8765'},
  webServer: {command:'python3 -m http.server 8765 --bind 127.0.0.1',url:'http://127.0.0.1:8765/index-v05.html',reuseExistingServer: !process.env.CI}
};
