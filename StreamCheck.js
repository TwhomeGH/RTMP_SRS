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






/**
 * 
 * @param {*} userId 識別是哪個用戶的方案
 * @param {*} newPlanId 方案等級 Basic Pro Plus
 * @param {*} active 啟用或關閉
 * @param {*} id 要更新的指定Plan方案 識別ID
 * @returns 
 */

async function switchPlan(userId, newPlanId, active = true, id = -1) {
  try {
    const now = new Date();
    const newPlanDay = getPlanById(newPlanId, 1);

    const current = await pool.query(
      `SELECT id, plan_id, start_at, expire_at
         FROM user_plans
         WHERE user_id = $1 AND active = true
         ORDER BY expire_at DESC
         LIMIT 1`,
      [userId]
    );

    let totalDays = newPlanDay;

    if (current.rows.length > 0) {
      const startAt = new Date(current.rows[0].start_at);
      const oldPlanId = current.rows[0].plan_id;
      const oldPlanDay = getPlanById(oldPlanId, 1);

      const usedDays = Math.floor((now - startAt) / (24 * 60 * 60 * 1000));
      const remainingDays = Math.max(0, oldPlanDay - usedDays);

      await pool.query(
        `UPDATE user_plans SET active = false WHERE id = $1`,
        [current.rows[0].id]
      );

      if (newPlanId === oldPlanId) {
        // 同方案 → 保持剩餘天數
        totalDays = remainingDays;
      } else if (newPlanDay > oldPlanDay) {
        // 升級 → 新方案天數 + 舊方案剩餘天數
        totalDays = newPlanDay + remainingDays;
      } else {
        // 降級 → 只用新方案天數
        totalDays = newPlanDay;
      }

      console.log(`舊方案天數: ${oldPlanDay}, 已使用: ${usedDays}, 剩餘: ${remainingDays}, 新方案天數: ${newPlanDay}, 最終計算: ${totalDays}`);
    }

    const startAt = now;
    const newExpire = new Date(startAt.getTime() + totalDays * 24 * 60 * 60 * 1000);

    let result;
    if (id >= 0) {
      result = await pool.query(
        `UPDATE user_plans
         SET plan_id = $1,
             expire_at = $2,
             active = $3,
             start_at = $4
         WHERE id = $5 AND user_id = $6
         RETURNING *`,
        [newPlanId, newExpire, active, startAt, id, userId]
      );
    } else {
      result = await pool.query(
        `INSERT INTO user_plans (user_id, plan_id, expire_at, active, start_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, newPlanId, newExpire, active, startAt]
      );
    }

    if (result.rows.length > 0) {
      console.log('切換/新增方案成功:', result.rows[0]);
      return result.rows[0];
    } else {
      console.log('沒有更新或插入任何方案');
      return null;
    }
  } catch (err) {
    console.error('切換方案失敗:', err);
    throw err;
  }
}







/**
 * 
 * @param {*} id 是否已有存在方案的ID
 * @param {*} userId UID識別
 * @param {*} plan_id 方案等級
 * @param {*} expiredAt 過期時間
 * @param {*} planDay 方案天數
 * @param {*} active 啟用或關閉
 * @returns 
 */
async function addPlan(id = -1, userId = "R2", plan_id = 0, expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000), planDay = 5, active = true) {
  // 先停用舊方案
  await pool.query(
    `UPDATE user_plans SET active = false WHERE user_id = $1 AND active = true`,
    [userId]
  );

  
  
  console.log("輸入的Plan",id,"UID",userId,"PIanID等級",plan_id,"Exp",expiredAt,active)


  // 查出舊方案的到期時間 (如果有的話)
  const latest = await pool.query(
    `SELECT MAX(expire_at) as latest_expire
       FROM user_plans
       WHERE user_id = $1`,
    [userId]
  );

  let baseExpire = expiredAt; // 預設從當前輸入時間算
  if (latest.rows[0].latest_expire) {
    baseExpire = new Date(latest.rows[0].latest_expire);
  }

  // 新方案的到期時間
  let newExpire = new Date(baseExpire.getTime() + (planDay * 24 * 60 * 60 * 1000));

  let query, value;
  if (id >= 0) {
    query = `
      UPDATE user_plans
      SET plan_id = $1,
          expire_at = $2,
          active = $3
      WHERE id = $4
      RETURNING *
    `;
    value = [plan_id, newExpire, active, id];
  } else {
    query = `
      INSERT INTO user_plans (user_id, plan_id, expire_at, active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    value = [userId, plan_id, newExpire, active];
  }

  const result = await pool.query(query, value);

  if (result.rows.length > 0) {
    console.log('切換/新增方案成功:', result.rows[0]);
    return result.rows[0];
  } else {
    console.log('沒有更新或插入任何方案');
    return null;
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



// 建立 planID 對應 key
const planMap = {
  0: "basic",
  1: "pro",
  2: "plus"
};


/**
 * @brief 用 planID 查方案
 *
 * @param {*} key 他方案識別名
 * @param {number} [type=0] 0取顯示名字 1取天數 2取Plan等級ID
 * @return {*} 
 */
function getPlanById(planID, type = 0) {
  const key = planMap[planID];
  if (!key) return "未知方案";
  return getPlan(key, type);
}



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


/**
 *
 *
 * @param {*} key 他方案識別名
 * @param {number} [type=0] 0取顯示名字 1取天數 2取Plan等級ID
 * @return {*} 
 */
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

// 切換方案
app.post('/switch-plan', express.json(), async (req, res) => {

  const authHeader = req.headers['authorization'];
  
  if (!authHeader) return res.status(401).json({ error: '未授權' });

  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效' });
  }

  const { userId, updatePlanID ,planID } = req.body;
  try {

    var result = {}

    console.log("當前等級PlanID",planID,getPlanById(planID,1))
    
    result = await switchPlan(userId, planID,true,updatePlanID);

    
    console.log("方案",getPlanById(planID,0),"天數",getPlanById(planID, 1),"Plan等級ID",getPlanById(planID, 2),"用戶",userId)


    res.json({ status: 'ok', plan: result });
  } catch (err) {
    console.error('切換方案失敗:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});



// 測試購買入口 (GET with query)
app.get('/test-purchase', async (req, res) => {
  try {
    // 從 query 參數取得測試資料
    const { userID, plan, planID, isRenew, streamKey } = req.query;

    // 模擬 webhook event
    const event = {
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        custom_id: JSON.stringify({
          planID: planID || 123,
          userID: userID || 456,
          plan: plan || 'basic',
          isRenew: isRenew === 'true',
          streamKey: streamKey || null
        })
      }
    };

    // --- 處理付款完成事件 ---
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const payerId = JSON.parse(event.resource.custom_id);
      const productId = 1;
      let streamKeyValue;
      const expiredAt = new Date(Date.now() + getPlan(payerId.plan, 1) * 24 * 60 * 60 * 1000);

      if (payerId.isRenew) {
        streamKeyValue = payerId.streamKey;
        console.log('續訂 StreamKey:', streamKeyValue, expiredAt.toLocaleString());
      } else {
        streamKeyValue = generateStreamKey();
        console.log('產生 StreamKey:', streamKeyValue, expiredAt.toLocaleString());
      }

      await addPlan(payerId.planID, payerId.userID, getPlan(payerId.plan, 2), expiredAt, getPlan(payerId.plan, 1), true);
      await addStreamKey(streamKeyValue, payerId.userID, productId, expiredAt, pool);
    }

    res.json({ status: 'ok', message: '測試購買流程完成' });
  } catch (err) {
    console.error('測試購買失敗:', err);
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
import { type } from 'os';
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