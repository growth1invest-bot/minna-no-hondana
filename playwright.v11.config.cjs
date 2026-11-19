const base=require('./playwright.v101.config.cjs');
module.exports={...base,testMatch:'**/v11*.test.cjs',use:{...base.use,baseURL:'http://127.0.0.1:8772'},webServer:{command:'python3 -m http.server 8772 --bind 127.0.0.1',url:'http://127.0.0.1:8772/index-v11.html',reuseExistingServer:!process.env.CI}};
