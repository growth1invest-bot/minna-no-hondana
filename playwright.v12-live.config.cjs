const base=require('./playwright.v12.config.cjs');
module.exports={...base,testMatch:'**/v12-connection.live.cjs',timeout:45000,webServer:undefined};
