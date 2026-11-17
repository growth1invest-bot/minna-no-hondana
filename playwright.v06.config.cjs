const base=require('./playwright.config.cjs');
module.exports={...base,testMatch:'**/v06.test.cjs',use:{...base.use,baseURL:'http://127.0.0.1:8766'},webServer:{command:'python3 -m http.server 8766 --bind 127.0.0.1',url:'http://127.0.0.1:8766/index-v06.html',reuseExistingServer:!process.env.CI}};
