const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../db");

router.get("/", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const user = db.prepare("SELECT id, name, username FROM users WHERE id = ?").get(req.session.userId);
  const profile = db.prepare("SELECT * FROM profile WHERE user_id = ?").get(req.session.userId);

  if (!user || !profile) {
    return res.status(404).json({ error: "Profile not found" });
  }
  res.json({ user, profile });
});

router.get("/page", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "profile.html"));
});

module.exports = router;