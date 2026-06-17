// database.js – PostgreSQL version for Railway
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Railway
});

// Initialize tables
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id),
        FOREIGN KEY (receiver_id) REFERENCES users(id)
      )
    `);
  } finally {
    client.release();
  }
}

// Call init on startup
initDB().catch(err => console.error('DB init error:', err));

// Helper functions (same interface as before)
async function getUser(id) {
  const res = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
  return { exists: res.rows.length > 0 };
}

async function createUser() {
  const res = await pool.query('INSERT INTO users DEFAULT VALUES RETURNING id');
  return res.rows[0].id;
}

async function getMessages(userId1, userId2) {
  const res = await pool.query(`
    SELECT id, sender_id, receiver_id, content, timestamp
    FROM messages
    WHERE (sender_id = $1 AND receiver_id = $2)
       OR (sender_id = $2 AND receiver_id = $1)
    ORDER BY timestamp ASC
  `, [userId1, userId2]);
  return res.rows;
}

async function saveMessage(senderId, receiverId, content) {
  const res = await pool.query(`
    INSERT INTO messages (sender_id, receiver_id, content)
    VALUES ($1, $2, $3)
    RETURNING id, sender_id, receiver_id, content, timestamp
  `, [senderId, receiverId, content]);
  return res.rows[0];
}

module.exports = {
  getUser,
  createUser,
  getMessages,
  saveMessage,
};