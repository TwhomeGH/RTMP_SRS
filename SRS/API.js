import express, { json } from 'express';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '..', '.env') });



import { pool } from '../API/pool.js';
import cry from '../API/cry.js'; // 假設你有 decrypt 函數

const app = express();
app.use(json());

app.post('/api/v1/orxy', async (req, res) => {
  try {
    console.log('收到請求', req.body)
    const { app, stream: incomingStreamKey } = req.body;

    
    return res.json({ code: 0});
  }
  catch (err) {
    console.log('BAK',err)
  }
}
)

app.post('/api/v1/forward', async (req, res) => {
  try {
    console.log('收到請求', req.body)
    const { app, stream: incomingStreamKey } = req.body;

    if (app !== 'live') {
      return res.json({ code: 0, data: { urls: [] } });
    }

    // 1️⃣ 從 menu 表查 user_id
    // 如果你存的是加密 stream_key，先用 safeDecrypt 解密
    const menuResult = await pool.query(
      'SELECT user_id FROM menu WHERE "streamKey" = $1 LIMIT 1',
      [incomingStreamKey]
    );

    if (menuResult.rowCount === 0) {
      return res.json({ code: 0, data: { urls: [] } });
    }

    const userId = menuResult.rows[0].user_id;

    // 2️⃣ 查 stream 表取這個 user_id 的所有 forward 配置
    const streamResult = await pool.query(
      'SELECT * FROM stream WHERE user_id = $1',
      [userId]
    );

    console.log("Debug", streamResult)

    // 3️⃣ 解析 rtmp_url 與 stream_key
    const streams = streamResult.rows.map(row => ({
      rtmp_url: row.rtmp_url,
      stream_key: cry.safeDecrypt({ data: row.stream_key_data, iv: row.stream_key_iv })
    }));

    // 4️⃣ 回傳 rtmp_url 給 SRS（可選附帶 stream_key）
    const urls = streams.map(s => {
      const baseUrl = s.rtmp_url.replace(/\/+$/, ""); // 去掉結尾所有斜線
      return `${baseUrl}/${s.stream_key}`;
    });

    return res.json({ code: 0, data: { urls } });

  } catch (err) {
    console.error('Forward API 錯誤:', err);
    return res.json({ code: 1, msg: '伺服器錯誤' });
  }
});

app.listen(8085, "0.0.0.0", () => console.log("Backend API 監聽 8085"));