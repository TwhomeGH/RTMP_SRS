// WebJS/config.js

// 根據目前網址自動判斷是開發或正式環境
const isDev = location.hostname === 'localhost' || location.hostname.startsWith('192.168.');

console.log(`Running in ${isDev ? 'development' : 'production'} mode.`);

export const API_BASE_URL = isDev
  ? 'http://192.168.0.102:8500'   // 開發環境
  : 'https://api.coffee0709.cc.cd';     // 正式環境

export const ENV = isDev ? 'development' : 'production';