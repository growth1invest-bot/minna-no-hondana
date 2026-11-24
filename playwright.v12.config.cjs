const base=require('./playwright.v111.config.cjs');
module.exports={...base,testMatch:'**/v12*.test.cjs',use:{...base.use,baseURL:'http://127.0.0.1:8774'},webServer:{command:'python3 -m http.server 8774 --bind 127.0.0.1',url:'http://127.0.0.1:8774/index-v12.html',reuseExistingServer:!process.env.CI}};
