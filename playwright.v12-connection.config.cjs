const base=require('./playwright.v12.config.cjs');
module.exports={...base,testMatch:'**/v12-connection.real.cjs',timeout:60000,
  use:{...base.use,baseURL:'http://127.0.0.1:8776'},
  webServer:{command:'python3 -m http.server 8776 --bind 127.0.0.1',url:'http://127.0.0.1:8776/index-v12.html',reuseExistingServer:false}};
