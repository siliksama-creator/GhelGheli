const { pool } = require('../config/db');
let admin = null;
function getFirebase() {
  if (admin) return admin;
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    admin = require('firebase-admin');
    const credential = admin.credential.cert(JSON.parse(raw));
    if (!admin.apps.length) admin.initializeApp({ credential });
    return admin;
  } catch (e) {
    console.warn('FCM disabled:', e.message);
    return null;
  }
}
async function createNotification(userId, type, title, body) {
  const { rows } = await pool.query(
    'INSERT INTO notifications(user_id,type,title,body) VALUES ($1,$2,$3,$4) RETURNING *',
    [userId || null, type, title, body]
  );
  if (userId) await sendPushToUser(userId, title, body, { type });
  return rows[0];
}
async function sendPushToUser(userId, title, body, data = {}) {
  const fb = getFirebase();
  if (!fb) return false;
  const { rows } = await pool.query('SELECT fcm_token FROM users WHERE id=$1 AND fcm_token IS NOT NULL', [userId]);
  if (!rows[0]?.fcm_token) return false;
  await fb.messaging().send({ token: rows[0].fcm_token, notification: { title, body }, data });
  return true;
}
module.exports = { createNotification, sendPushToUser };
