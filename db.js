
require("dotenv").config();
const { createClient } = require("@libsql/client");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS wallet (
      user_id INTEGER PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      deadline TEXT,
      reminder_time TEXT,
      duration_minutes INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      points INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      actual_minutes INTEGER,
      slack_minutes INTEGER
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      step_text TEXT NOT NULL,
      step_points INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject_name TEXT NOT NULL,
      understanding TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS quiz_results (
      user_id INTEGER PRIMARY KEY,
      results TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS profile (
      user_id INTEGER PRIMARY KEY,
      physical_strength INTEGER NOT NULL DEFAULT 50,
      endurance INTEGER NOT NULL DEFAULT 50,
      persistence INTEGER NOT NULL DEFAULT 50,
      problem_solving INTEGER NOT NULL DEFAULT 50,
      resilience INTEGER NOT NULL DEFAULT 50,
      teamwork INTEGER NOT NULL DEFAULT 50,
      leadership INTEGER NOT NULL DEFAULT 50,
      independence INTEGER NOT NULL DEFAULT 50,
      risk_tolerance INTEGER NOT NULL DEFAULT 50,
      decision_speed INTEGER NOT NULL DEFAULT 50,
      sleep_hours INTEGER NOT NULL DEFAULT 0,
      eating_hours INTEGER NOT NULL DEFAULT 0,
      bath_hours INTEGER NOT NULL DEFAULT 0,
      toilet_hours INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS owned_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS entertainment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      points INTEGER NOT NULL,
      watched_at TEXT NOT NULL
    )
  `);

  console.log("✅ Database tables ready");
}

initDb().catch(err => {
  console.error("❌ Failed to initialize database:", err.message);
});

module.exports = db;
