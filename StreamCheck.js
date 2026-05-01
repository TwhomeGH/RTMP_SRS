import express, { json } from 'express';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

import rtmp from './API/rtmp.js'
import usercall, { generateStreamKey } from './API/user.js'

import https from 'https';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '.env') });


import { pool } from './API/pool.js'

//console.log(process.env)

// 新增
async function addPlan(id = -1, userId = "R2", plan_id = 0, expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000), planDay = 5, active = true) {
  let query, value
  // 先查出該用戶的最新到期時間
  const latest = await pool.query(
    `SELECT MAX("expire_at") as latest_expire
       FROM user_plans
       WHERE "user_id" = $1`,
    [userId]
  );

  let baseExpire = expiredAt // 預設從當前輸入時間算
  if (latest.rows[0].latest_expire) {
    baseExpire = new Date(latest.rows[0].latest_expire);
  }
  console.log(planDay, baseExpire.toLocaleString())
  // 假設方案要加 30 天
  let newExpire = new Date(baseExpire.getTime() + (planDay * 24 * 60 * 60 * 1000));

  if (id >= 0) {
    console.log('PLANID', id, plan_id, planDay)
    query = `
    UPDATE user_plans
    SET "plan_id" = $1,
        "expire_at"= $2,
        "active" = $3
    WHERE "id" = $4
    RETURNING *
    `

    value = [plan_id, newExpire, active, id]

  } else {

    query = `
    INSERT INTO user_plans ("user_id","plan_id","expire_at","active")
    VALUES ($1,$2,$3,$4)
    RETURNING *
  `
    value = [userId, plan_id, newExpire, active]
  }

  const result = await pool.query(query, value);

  if (result.rowCount === 0) {
    console.log('新增 Plan 成功:', userId, plan_id, active, expiredAt.toLocaleString());

  } else {
    let DAYEXP = new Date(result.rows[0].expire_at)
    console.log('Plan 已存在:', userId, plan_id, active, DAYEXP.toLocaleString());

  }
}


// 新增
async function addStreamKey(streamKeyValue, userId = "R2", productId = "R2", expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
  const query = `
    INSERT INTO menu ("streamKey","user_id","product_id","expiredAt")
    VALUES ($1,$2,$3,$4)
    ON CONFLICT ("streamKey")
    DO UPDATE SET 
    "user_id" = EXCLUDED."user_id", 
    "product_id" = EXCLUDED."product_id",
    "expiredAt" = GREATEST(menu."expiredAt", NOW()) + (EXCLUDED."expiredAt" - NOW())
    RETURNING *
  `;
  const result = await pool.query(query, [streamKeyValue, userId, productId, expiredAt]);

  if (result.rowCount === 0) {
    console.log('新增 streamKey 成功:', streamKeyValue, userId, productId, expiredAt.toLocaleTimeString());

  } else {
    console.log('streamKey 已存在:', streamKeyValue, userId, productId, new Date(result.rows[0].expiredAt).toLocaleString());


  }
}

// 刪除
async function deleteStreamKey(streamKeyValue) {
  const query = 'DELETE FROM menu WHERE "streamKey" = $1';
  await pool.query(query, [streamKeyValue]);
  console.log('刪除 streamKEY 成功:', streamKeyValue);
}

// 測試連線
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('連線成功！');
    client.release();
  } catch (err) {
    console.error('連線失敗:', err);
  }
}


import cors from 'cors';

const app = express();
// 啟用 CORS
app.use(cors({
  origin: '*',   // ⚠️ 測試階段可以先用 *，正式環境建議改成你的前端域名
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))




app.use(json());


// 方案對應金額
const plans = {
  basic: {
    name: "嚐鮮",
    amount: "5",
    period: "5 天",
    day: 5,
    planID: 0
  },
  pro: {
    name: "基本",
    amount: "10",
    period: "14 天",
    day: 14,
    planID: 1
  },
  plus: {
    name: "專業",
    amount: "20",
    period: "30 天",
    day: 30,
    planID: 2
  }
};

// 取顯示用名稱
function getPlan(key, type = 0) {
  let result
  switch (type) {
    case 0:
      result = plans[key]?.name || "未知方案"
      break;
    case 1:
      result = plans[key]?.day || 5;
      break;
    case 2:
      result = plans[key]?.planID || 0;


  }
  return result;
}



// 1️⃣ 建立 PayPal 訂單
app.post('/create-order', async (req, res) => {
  const { userID, isRenew, streamKey, plan, planID } = req.body;
  const clientId = process.env.PAYPAL_CLIENT_ID_SANDBOX;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET_SANDBOX;

  // 取得 access token
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenResp = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const tokenData = await tokenResp.json();



  const selectedPlan = plans[plan];

  // 建立訂單
  const orderResp = await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            value: selectedPlan.amount,
            currency_code: 'USD',
            breakdown: {
              item_total: { currency_code: "USD", value: selectedPlan.amount }
            }
          },


          items: [
            {
              name: `${getPlan(plan)} 方案訂購`,
              description: `${selectedPlan.period}`,
              unit_amount: { currency_code: "USD", value: selectedPlan.amount },
              quantity: "1"
            }
          ],
          custom_id: JSON.stringify(
            {
              "userID": userID.toString(),
              isRenew, streamKey, plan, planID
            })
        }
      ]
    })
  });

  const orderData = await orderResp.json();
  res.json(orderData);
});


// 取得 PayPal Access Token
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID_SANDBOX;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET_SANDBOX;
  const base64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${base64}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await res.json();
  return data.access_token;
}


// 驗證 webhook 簽名
async function verifyWebhook(eventBody, headers) {
  const token = await getPayPalAccessToken();

  const body = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: process.env.PAYPAL_WEBHOOK_ID_SANDBOX, // 你的 webhook ID
    webhook_event: eventBody
  };

  const res = await fetch('https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const result = await res.json();
  return result;
}

// 後端 capture-order
app.post('/capture-order', async (req, res) => {
  const { orderID } = req.body;

  if (!orderID) return res.status(400).json({ error: 'Missing orderID' });

  try {
    const token = await getPayPalAccessToken();

    const response = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();

    // 如果付款成功，可以在這裡生成 streamKey 或存入資料庫
    if (result.status === 'COMPLETED') {
      console.log('付款完成:', orderID);
      // TODO: generateStreamKey()
      
    }

    res.json(result);
  } catch (err) {
    console.error('capture-order error:', err);
    res.status(500).json({ error: 'Failed to capture order', details: err });
  }
})
// 2️⃣ Webhook 處理付款完成
app.post('/webhook', express.json(), async (req, res) => {
  try {
    const event = req.body;
    const headers = req.headers;

    // 驗證 webhook
    const isValid = await verifyWebhook(event, headers);
    if (isValid.verification_status !== 'SUCCESS') {
      console.warn('Webhook 簽名驗證失敗');
      return res.sendStatus(400);
    }

    // --- 處理付款完成事件 ---
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const payerId = JSON.parse(event.resource.custom_id);
      const productId = 1; // 假設都是同一產品
      let streamKey
      const expiredAt = new Date(Date.now() + getPlan(payerId.plan, 1) * 24 * 60 * 60 * 1000); // 1day過期



      if (payerId.isRenew) {
        streamKey = payerId.streamKey;
        console.log('Plan', getPlan(payerId.plan), '天數', getPlan(payerId.plan, 1), '續訂StreamKey:', streamKey, expiredAt.toLocaleString());
      } else {
        streamKey = generateStreamKey();
        console.log('產生StreamKey:', streamKey, expiredAt.toLocaleString());
      }
      console.log(payerId)
      await addPlan(payerId.planID, payerId.userID, getPlan(payerId.plan, 2), expiredAt, getPlan(payerId.plan, 1), true)
      await addStreamKey(streamKey, payerId.userID, productId, expiredAt, pool);

    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook 處理失敗:', err);
    res.sendStatus(500);
  }
});



// app.post('/purchase', async (req, res) => {
//     const { userId, productId ,expiredAt} = req.body;

//     try {
//         // 1️⃣ 生成唯一 streamKey
//         const streamKey = generateStreamKey();

//         // 2️⃣ 存到資料庫
//         await addStreamKey(streamKey,userId,productId,expiredAt);

//         // 3️⃣ 返回給前端
//         res.json({ success: true, streamKey });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ success: false, error: '生成 streamKey 失敗' });
//     }
// });

app.get('/api/platforms', async (req, res) => {

  try {
    const result = await pool.query('SELECT id, platform_name, rtmp_url FROM platforms_list ORDER BY id DESC');
    res.json(result.rows); // 回傳 [{ id, name, rtmp_url }, ...]
  } catch (err) {
    console.error("查詢平台清單失敗:", err);
    res.status(500).json({ error: '資料庫查詢失敗' });
  }

})

app.use('/', rtmp)
app.use('/', usercall)

// 設定預設頁面
app.get('/', (req, res) => {
  res.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stream Check API</title></head><body><h1>Stream Check API</h1><p>請使用正確的 API 路徑進行操作。</p></body></html>');
  res.end();

});



import nodeCron from 'node-cron';
import e from 'express';
// 啟動
async function main() {

  await testConnection();

  const options = {
    key: fs.readFileSync('./CERT/privkey.pem'),
    cert: fs.readFileSync('./CERT/cert.pem')
  };



  // https.createServer(options, app).listen(8500, "0.0.0.0", () => {
  //   console.log('HTTPS Hook 後端啟動於 8500 端口')
  // });

  app.listen(8500, () => {
    console.log('HTTP Hook 後端啟動於 8500 端口')
  });

  nodeCron.schedule('0 * * * *', async () => {
    console.log('每小時執行一次，刪除過期 streamKey');
    const query = 'DELETE FROM menu WHERE "expiredAt" < NOW()';
    const result = await pool.query(query);
    console.log(`刪除 ${result.rowCount} 筆過期的 streamKey`);
  });

}

main().catch(console.error);