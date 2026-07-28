const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json(wallet);
});

router.post("/add", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "YOU NEED TO LOGIN FIRST" });
  }
  const { amount } = req.body;
  db.prepare("UPDATE wallet SET balance = balance + ? WHERE user_id = ?").run(amount, req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json(wallet);
});

router.post("/subtract", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "YOU NEED TO LOGIN FIRST" });
  }
  const { amount } = req.body;
  db.prepare("UPDATE wallet SET balance = balance - ? WHERE user_id = ?").run(amount, req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json(wallet);
});

module.exports = router;