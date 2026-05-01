import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from 'dotenv';

import cors from 'cors';

import fs from 'fs';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '.env') });


var USE_SANDBOX = process.env.USE_SANDBOX === "true"

var PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID
var PAYPAL_CURRENCY = process.env.PAYPAL_CURRENCY | "USD"

if (USE_SANDBOX) {
  console.log("使用沙盒模式 PayPal")
  PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID_SANDBOX
} else {
  console.log("使用正式模式 PayPal")
}



const app = express();

// 啟用 CORS
app.use(cors({
  origin: '*',   // ⚠️ 測試階段可以先用 *，正式環境建議改成你的前端域名
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))



app.get('/pay.html', (req, res) => {
  const filePath = path.join(__dirname, 'pay.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) {
      res.status(500).send('Server Error');
      return;
    }

    // 替換佔位符
    let filledHtml = html
      .replace(/\$\{PAYPAL_CLIENT_ID\}/g, PAYPAL_CLIENT_ID || '')
      .replace(/\$\{PAYPAL_CURRENCY\}/g, PAYPAL_CURRENCY || 'USD')


    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(filledHtml);
  });


});


// 設定預設頁面
app.get('/', (req, res) => {


  const filePath = path.join(__dirname, 'pay.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) {
      res.status(500).send('Server Error');
      return;
    }

    // 替換佔位符
    let filledHtml = html
      .replace(/\$\{PAYPAL_CLIENT_ID\}/g, PAYPAL_CLIENT_ID || '')
      .replace(/\$\{PAYPAL_CURRENCY\}/g, PAYPAL_CURRENCY || 'USD')
    

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(filledHtml);
  });



});


// 其他預設頁面
app.use(express.static(path.join(__dirname), {
  extensions: ['html']

}))



app.listen(8600, "0.0.0.0", () => {
  console.log('PayPal 網站前端啟動於 8600 端口');
})