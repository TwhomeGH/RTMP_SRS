import exprsss, { Router } from 'express'

import crypto from 'crypto';

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

import { pool } from './pool.js'
import cry from './cry.js'

function generateStreamKey() {
  return crypto.randomBytes(8).toString('hex'); // 16 位十六進位
}

const app = exprsss.Router()


app.get('/aes', async (req, res) => {

  let KEY = crypto.randomBytes(32).toString('hex');
  res.json({ "KEY": KEY })

})

// 註冊接口
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '請提供帳號與密碼' });
    }

    // 檢查帳號是否存在
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (userCheck.rowCount > 0) {
      return res.status(400).json({ error: '帳號已存在' });
    }

    // 密碼哈希
    const hashedPassword = await bcrypt.hash(password, 10);

    // 新增用戶
    await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2)',
      [username, hashedPassword]
    );

    res.json({ message: '註冊成功' });
  } catch (err) {
    console.error('註冊失敗:', err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});


//登入模塊
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  console.log('登入請求:', { username });
  if (!username || !password) {
    return res.status(400).json({ error: '請提供帳號與密碼' });
  }
  
  const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  const user = result.rows[0];

  if (!user) return res.status(401).json({ error: '使用者不存在' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: '密碼錯誤' });

  const token = jwt.sign({ userID: user.user_id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});



//個人資訊

app.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) return res.status(401).json({ error: '未授權' });

  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效' });
  }

  // payload 裡可以包含 id, username
  res.json({ id: payload.userID, username: payload.username });
});

//StreamKey查詢
app.get('/my-plan', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: '未授權' });

  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效' });
  }


  const keys = await pool.query(
    `SELECT "id" ,"plan_id", "start_at", "expire_at","active"
     FROM user_plans
     WHERE "user_id" = $1
     `,
    [payload.userID] // 建議用 user_id，不要用 username
  );

  res.json(keys.rows)
});

//StreamKey查詢
app.get('/my-stream-keys', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: '未授權' });

  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效' });
  }


  const keys = await pool.query(
    `SELECT "key_id", "streamKey", "product_id", "expiredAt"
   FROM menu
   WHERE "user_id" = $1`,
    [payload.userID] // 建議用 user_id，不要用 username
  );

  res.json(keys.rows)
});


//重生生成StreamKey


app.post('/regenerate-key', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: '未授權' });
  let { key_id } = req.body
  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效' });
  }

  // 先檢查 key 是否屬於該使用者
  const result = await pool.query(
    `SELECT * FROM menu WHERE key_id = $1 AND user_id = $2`,
    [key_id, payload.username]
  )
  if (result.rowCount === 0) {
    return res.status(403).json({ error: "無法操作此 key" });
  }

  // 生成新的 key
  const newKey = generateStreamKey();

  // 更新資料庫
  let u2 = await pool.query(
    `UPDATE menu SET "streamKey" = $1 WHERE key_id = $2 RETURNING *`,
    [newKey, key_id]
  );

  let expired = new Date()
  if (u2.rows.length > 0) {
    let u2res = u2.rows[0]
    expired = u2res.expiredAt
  }

  res.json({ streamKey: newKey, expiredAt: expired, key: key_id });
});



// 新增
async function addForwardStream(rtmp_url, stream_key, platform_name, userId = "R2", listID) {
  let query, values;
  // 密碼哈希
  const hashedStreamKey = cry.encrypt(stream_key)

  if (listID) {
    // 編輯已有資料 → 用 UPDATE
    query = `
      UPDATE stream
      SET "rtmp_url" = $1,
          "stream_key_iv" = $2,
          "stream_key_data" = $3,
          "platform_name" = $4,
          "user_id" = $5
      WHERE "id" = $6
      RETURNING *;
    `;
    values = [rtmp_url, hashedStreamKey.iv, hashedStreamKey.data, platform_name, userId, listID];
  } else {
    // 新增資料
    query = `
      INSERT INTO stream ("rtmp_url","stream_key_iv","stream_key_data","platform_name","user_id")
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *;
    `;
    values = [rtmp_url, hashedStreamKey.iv, hashedStreamKey.data, platform_name, userId];
  }

  const result = await pool.query(query, values);

  if (result.rowCount === 0) {
    console.log('⚠️ 無變更');
  } else {
    console.log('✅ 成功:', result.rows[0]);
  }
  return result
}

// 刪除指定配置
async function deleteForwardStream(id, userId) {
  const query = `
    DELETE FROM stream
    WHERE "id" = $1 AND "user_id" = $2
    RETURNING *;
  `;
  const values = [id, userId];

  const result = await pool.query(query, values);

  if (result.rowCount === 0) {
    console.log('⚠️ 找不到符合條件的資料或已刪除');
  } else {
    console.log('✅ 已刪除:', result.rows[0]);
  }

  return result;
}

app.post('/set/forward', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: '未授權' });
  let { rtmp_url, stream_key, platform_name, list_id } = req.body
  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效' });
  }

  let RSS = await addForwardStream(rtmp_url, stream_key, platform_name, payload.userID, list_id)
  res.json(RSS.rows)
})


app.post('/remove/forward', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: '未授權' });
  let { list_id } = req.body
  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效' });
  }

  let RSS = await deleteForwardStream(list_id, payload.userID)
  res.json(RSS.rows)
})


app.post('/get/forward', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: '未授權' });
  //let { rtmp_url,stream_key,platform_name ,rtmp_list_id}=req.body
  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效' });
  }

  try {
    const userId = payload.userID; // 假設 authMiddleware 已經解析 token 得到 userId
    const query = `SELECT * FROM stream WHERE "user_id" = $1 ORDER BY "id" DESC`;
    const result = await pool.query(query, [userId]);
    const rows = result.rows.map(row => ({
      ...row,
      stream_key: cry.safeDecrypt({
        data: row.stream_key_data,
        iv: row.stream_key_iv
      })
    }));

    res.json(rows);

  } catch (err) {
    console.error("DB錯誤:", err);
    res.status(500).json({ success: false, message: "伺服器錯誤" });
  }

})


export default app
export { generateStreamKey }