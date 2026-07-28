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
  const profile = db.prepare("SELECT * FROM profile WHERE user_id = ?").get(req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json({ profile, wallet });
});

router.post("/buy", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const { item } = req.body;

  const prices = { sleep: 100, eating: 50, bath: 50, toilet: 50 };
  const maxHours = { sleep: 8, eating: 5, bath: 1, toilet: 1 };
  const column = `${item}_hours`;

  if (!prices[item]) {
    return res.status(400).json({ error: "Invalid item" });
  }

  const profile = db.prepare("SELECT * FROM profile WHERE user_id = ?").get(req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);

  if (profile[column] >= maxHours[item]) {
    return res.status(400).json({ error: "Maximum reached" });
  }
  if (wallet.balance < prices[item]) {
    return res.status(400).json({ error: "Not enough points" });
  }

  db.prepare(`UPDATE profile SET ${column} = ${column} + 1 WHERE user_id = ?`).run(req.session.userId);
  db.prepare("UPDATE wallet SET balance = balance - ? WHERE user_id = ?").run(prices[item], req.session.userId);

  const updatedProfile = db.prepare("SELECT * FROM profile WHERE user_id = ?").get(req.session.userId);
  const updatedWallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json({ profile: updatedProfile, wallet: updatedWallet });
});

module.exports = router;