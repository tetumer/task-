const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../db");

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "shop.html"));
});

router.get("/data", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const userId = req.session.userId;

  const profile = db
    .prepare("SELECT * FROM profile WHERE user_id = ?")
    .get(userId);

  const wallet = db
    .prepare("SELECT * FROM wallet WHERE user_id = ?")
    .get(userId);

  const games = db
    .prepare("SELECT * FROM owned_games WHERE user_id = ? ORDER BY id")
    .all(userId);

  const history = db
    .prepare(`
      SELECT *
      FROM entertainment_history
      WHERE user_id = ?
      ORDER BY watched_at DESC
    `)
    .all(userId);

  const today = db
    .prepare(`
      SELECT COALESCE(SUM(minutes), 0) AS minutes
      FROM entertainment_history
      WHERE user_id = ?
      AND date(watched_at) = date('now')
    `)
    .get(userId);

  res.json({
    profile,
    wallet,
    games,
    history,
    entertainmentToday: today.minutes,
    entertainmentRemaining: Math.max(0, 240 - today.minutes)
  });
});

router.post("/buy-game", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const { name } = req.body;
  const userId = req.session.userId;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Game name required" });
  }

  const games = db
    .prepare("SELECT * FROM owned_games WHERE user_id = ?")
    .all(userId);

  if (games.length >= 3) {
    return res.status(400).json({
      error: "You can only own 3 games. Delete one first."
    });
  }

  const wallet = db
    .prepare("SELECT * FROM wallet WHERE user_id = ?")
    .get(userId);

  const price = 50;

  if (wallet.balance < price) {
    return res.status(400).json({ error: "Not enough points" });
  }

  db.prepare(`
    INSERT INTO owned_games (user_id, game_name, created_at)
    VALUES (?, ?, ?)
  `).run(userId, name.trim(), new Date().toISOString());

  db.prepare(`
    UPDATE wallet
    SET balance = balance - ?
    WHERE user_id = ?
  `).run(price, userId);

  const updatedWallet = db
    .prepare("SELECT * FROM wallet WHERE user_id = ?")
    .get(userId);

  const updatedGames = db
    .prepare("SELECT * FROM owned_games WHERE user_id = ? ORDER BY id")
    .all(userId);

  res.json({
    wallet: updatedWallet,
    games: updatedGames
  });
});


router.post("/delete-game", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const { id } = req.body;

  db.prepare(`
    DELETE FROM owned_games
    WHERE id = ? AND user_id = ?
  `).run(id, req.session.userId);

  const games = db
    .prepare("SELECT * FROM owned_games WHERE user_id = ? ORDER BY id")
    .all(req.session.userId);

  res.json({ games });
});


router.post("/buy-entertainment", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const userId = req.session.userId;
  const { type, title, minutes, gameId } = req.body;

  const allowedTypes = ["game", "movie", "anime"];

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ error: "Invalid entertainment type" });
  }

  const duration = Number(minutes);

  if (!Number.isInteger(duration) || duration <= 0) {
    return res.status(400).json({ error: "Invalid duration" });
  }

  // Maximum 4 hours of entertainment per day
  const today = db.prepare(`
    SELECT COALESCE(SUM(minutes), 0) AS minutes
    FROM entertainment_history
    WHERE user_id = ?
    AND date(watched_at) = date('now')
  `).get(userId);

  if (today.minutes + duration > 240) {
    return res.status(400).json({
      error: `You only have ${240 - today.minutes} minutes of entertainment left today.`
    });
  }

  // Games must be owned first
  if (type === "game") {
    if (!gameId) {
      return res.status(400).json({ error: "Choose a game first" });
    }

    const game = db.prepare(`
      SELECT *
      FROM owned_games
      WHERE id = ? AND user_id = ?
    `).get(gameId, userId);

    if (!game) {
      return res.status(400).json({ error: "Game not found" });
    }
  }

  // Gaming = 30 min for 10 points
  // Movie/Anime = 1 hour for 10 points
  const price = type === "game"
    ? Math.ceil(duration / 30) * 10
    : Math.ceil(duration / 60) * 10;

  const wallet = db
    .prepare("SELECT * FROM wallet WHERE user_id = ?")
    .get(userId);

  if (wallet.balance < price) {
    return res.status(400).json({ error: "Not enough points" });
  }

  let finalTitle = title?.trim();

  if (type === "game") {
    const game = db.prepare(`
      SELECT game_name
      FROM owned_games
      WHERE id = ? AND user_id = ?
    `).get(gameId, userId);

    finalTitle = game.game_name;
  }

  if (!finalTitle) {
    return res.status(400).json({ error: "Name required" });
  }

  db.prepare(`
    INSERT INTO entertainment_history
    (user_id, type, title, minutes, points, watched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    type,
    finalTitle,
    duration,
    price,
    new Date().toISOString()
  );

  db.prepare(`
    UPDATE wallet
    SET balance = balance - ?
    WHERE user_id = ?
  `).run(price, userId);

  const updatedWallet = db
    .prepare("SELECT * FROM wallet WHERE user_id = ?")
    .get(userId);

  const history = db.prepare(`
    SELECT *
    FROM entertainment_history
    WHERE user_id = ?
    ORDER BY watched_at DESC
  `).all(userId);

  res.json({
    wallet: updatedWallet,
    history,
    entertainmentToday: today.minutes + duration,
    entertainmentRemaining: 240 - today.minutes - duration
  });
});



router.post("/buy", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const { item } = req.body;

  const items = {
    sleep:  { price: 30, amount: 1,   max: 8 },
    eating: { price: 20, amount: 1,   max: 5 },
    bath:   { price: 15, amount: 0.5, max: 1 },
    toilet: { price: 15, amount: 0.5, max: 1 }
  };

  if (!items[item]) {
    return res.status(400).json({ error: "Invalid item" });
  }

  const { price, amount, max } = items[item];
  const column = `${item}_hours`;

  const profile = db
    .prepare("SELECT * FROM profile WHERE user_id = ?")
    .get(req.session.userId);

  const wallet = db
    .prepare("SELECT * FROM wallet WHERE user_id = ?")
    .get(req.session.userId);

  if (profile[column] + amount > max) {
    return res.status(400).json({ error: "Maximum reached" });
  }

  if (wallet.balance < price) {
    return res.status(400).json({ error: "Not enough points" });
  }

  db.prepare(`
    UPDATE profile
    SET ${column} = ${column} + ?
    WHERE user_id = ?
  `).run(amount, req.session.userId);

  db.prepare(`
    UPDATE wallet
    SET balance = balance - ?
    WHERE user_id = ?
  `).run(price, req.session.userId);

  const updatedProfile = db
    .prepare("SELECT * FROM profile WHERE user_id = ?")
    .get(req.session.userId);

  const updatedWallet = db
    .prepare("SELECT * FROM wallet WHERE user_id = ?")
    .get(req.session.userId);

  res.json({
    profile: updatedProfile,
    wallet: updatedWallet
  });
});

module.exports = router;