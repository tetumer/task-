const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../db");
const path = require("path");

router.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "register.html"));
});

router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "login.html"));
});

router.post("/login", express.json(), async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  if (!user) {
    return res.status(401).json({ error: "YOU NEED TO REGISTER FIRST" });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: "INVALID USERNAME OR PASSWORD" });
  }

  req.session.userId = user.id;
  res.json({ success: true });
});

router.post("/register", express.json(), async (req, res) => {
  const { name, username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const result = db.prepare("INSERT INTO users (name, username, password) VALUES (?, ?, ?)")
      .run(name, username, hashedPassword);

    const newUserId = result.lastInsertRowid;
    db.prepare("INSERT INTO wallet (user_id, balance) VALUES (?, ?)").run(newUserId, 0);

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "Username already taken" });
  }
});

module.exports = router;