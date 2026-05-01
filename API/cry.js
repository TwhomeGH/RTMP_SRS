
import crypto from 'crypto';

import { config } from 'dotenv'
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname,'..', '.env') });



const key = Buffer.from(process.env.AES_KEY, 'hex'); // 32 bytes for AES-256

function encrypt(text) {
  const iv = crypto.randomBytes(16); // 每筆資料生成不同 IV
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { iv: iv.toString('hex'), data: encrypted };
}

function decrypt(encrypted) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(encrypted.iv, 'hex'));
  let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function safeDecrypt(encryptedText) {
  //console.log(encryptedText,'deb')
  if (!encryptedText || !encryptedText.data || !encryptedText.iv) return encryptedText;

  try {
    // 嘗試解密
    return decrypt(encryptedText);
  } catch (err) {
    // 解密失敗，可能是明文或格式錯誤，直接回傳原值
    console.warn('解密失敗，返回原值:', err.message);
    return encryptedText;
  }
}


export default { encrypt,decrypt,safeDecrypt}