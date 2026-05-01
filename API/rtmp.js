import exprsss from 'express'
import { pool } from './pool.js'

const app =exprsss.Router()

// 從資料庫查 streamKey
async function isValidStreamKey(streamKey) {
  const query = 'SELECT EXISTS(SELECT 1 FROM menu WHERE "streamKey" = $1 LIMIT 1)';
  const result = await pool.query(query, [streamKey]);
  console.log(result.rows[0].exists,'查詢結果:', result.rows);
  return result.rows[0].exists;
}

// 用戶連線
app.post('/on_connect', (req, res) => {
  const { client_id, ip } = req.body;
  console.log('連線:', client_id, ip);
  res.json({ code: 0, reason: 'ok' });
});

// 用戶開始推流
app.post('/on_publish', async (req, res) => {
  const { app,stream } = req.body;

  console.log('推流:', app, stream);
  if (app !== 'live') {
    res.json({ code: 0, reason: 'ok' });
    console.log('非 live app，允許推流');
    return;
  }
  if (await isValidStreamKey(stream)) {
    console.log('啟動 Forward:', stream);
    res.json({ code: 0, reason: 'ok' });
  } else {
    console.log("無效Keys",stream)
    res.json({ code: 1, reason: 'invalid streamkey' });
  }
});

// 用戶停止推流
app.post('/on_unpublish', (req, res) => {
  const { stream } = req.body;
  console.log('停止 Forward:', stream);
  res.json({ code: 0, reason: 'ok' });
});

// 用戶斷線
app.post('/on_close', (req, res) => {
  const { client_id } = req.body;
  console.log('斷線:', client_id);
  res.json({ code: 0, reason: 'ok' });
});



export default app