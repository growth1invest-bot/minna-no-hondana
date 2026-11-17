const base=require('./playwright.config.cjs');
module.exports={...base,testMatch:'**/v07.test.cjs',use:{...base.use,baseURL:'http://127.0.0.1:8767'},webServer:{command:'python3 -m http.server 8767 --bind 127.0.0.1',url:'http://127.0.0.1:8767/index-v07.html',reuseExistingServer:!process.env.CI}};
