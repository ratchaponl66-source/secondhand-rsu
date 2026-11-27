const fs = require('node:fs');
const path = require('node:path');

const isPostgres = Boolean(process.env.DATABASE_URL);
if (!isPostgres && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL is required in production; SQLite is for local development only.');
}

let sqlite;
let pool;
if (isPostgres) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 1 : 10)),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
} else {
  const Database = require('better-sqlite3');
  const databasePath = process.env.DB_PATH || path.join(__dirname, '..', 'secondhand.db');
  sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
}

let initialization;

async function initialize() {
  if (!initialization) {
    initialization = (async () => {
      if (isPostgres) {
        const schema = fs.readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf8');
        for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) {
          await pool.query(statement);
        }
        for (const category of ['หนังสือ', 'อุปกรณ์ IT', 'เสื้อผ้า', 'ของใช้หอพัก']) {
          await pool.query('INSERT INTO categories (category_name) VALUES ($1) ON CONFLICT (category_name) DO NOTHING', [category]);
        }
        return;
      }

      const schema = fs.readFileSync(path.join(__dirname, 'schema.sqlite.sql'), 'utf8');
      sqlite.exec(schema);
      const columns = sqlite.pragma('table_info(users)');
      if (!columns.some((column) => column.name === 'phone_public')) {
        sqlite.exec('ALTER TABLE users ADD COLUMN phone_public INTEGER NOT NULL DEFAULT 0 CHECK (phone_public IN (0, 1))');
      }
      const insertCategory = sqlite.prepare('INSERT OR IGNORE INTO categories (category_name) VALUES (?)');
      for (const category of ['หนังสือ', 'อุปกรณ์ IT', 'เสื้อผ้า', 'ของใช้หอพัก']) {
        insertCategory.run(category);
      }
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

function postgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function all(sql, params = []) {
  await initialize();
  if (isPostgres) return (await pool.query(postgresSql(sql), params)).rows;
  return sqlite.prepare(sql).all(...params);
}

async function get(sql, params = []) {
  await initialize();
  if (isPostgres) return (await pool.query(postgresSql(sql), params)).rows[0];
  return sqlite.prepare(sql).get(...params);
}

async function run(sql, params = []) {
  await initialize();
  if (isPostgres) {
    const result = await pool.query(postgresSql(sql), params);
    return { changes: result.rowCount, row: result.rows[0] };
  }
  const result = sqlite.prepare(sql).run(...params);
  return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
}

module.exports = { all, get, initialize, isPostgres, run };
