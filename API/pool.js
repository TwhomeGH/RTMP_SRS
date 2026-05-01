// db.js
import { config } from 'dotenv'
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname,'..', '.env') });


import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
    user: process.env.db_user,
    host: process.env.host,
    database: process.env.database || 'postgres',
    password: String(process.env.db_password),
    port: Number(process.env.pgport)
});


// let e=await pool.connect()
// console.log(e)