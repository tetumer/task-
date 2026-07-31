const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../db");
const path = require("path");


// =========================
// REGISTER PAGE
// =========================

router.get("/register", (req, res) => {
  res.redirect("/quiz");
});


// =========================
// LOGIN PAGE
// =========================

router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "login.html"));
});


// =========================
// LOGIN
// =========================

router.post("/login", express.json(), async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await db.execute({
      sql: "SELECT * FROM users WHERE username = ?",
      args: [username]
    });

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        error: "YOU NEED TO REGISTER FIRST"
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({
        error: "INVALID USERNAME OR PASSWORD"
      });
    }

    req.session.userId = user.id;

    res.json({
      success: true
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);

    res.status(500).json({
      error: "Something went wrong while logging in"
    });
  }
});


// =========================
// REGISTER
// =========================

router.post("/register", express.json(), async (req, res) => {
  try {
    const { name, username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.execute({
      sql: `
        INSERT INTO users (name, username, password)
        VALUES (?, ?, ?)
      `,
      args: [name, username, hashedPassword]
    });

    const newUserId = Number(result.lastInsertRowid);

    await db.execute({
      sql: `
        INSERT INTO wallet (user_id, balance)
        VALUES (?, ?)
      `,
      args: [newUserId, 500]
    });

    req.session.userId = newUserId;

    res.json({
      success: true
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);

    res.status(400).json({
      error: "Username already taken"
    });
  }
});


// =========================
// LOGOUT
// =========================

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {

    if (err) {
      console.error("LOGOUT ERROR:", err);

      return res.status(500).json({
        error: "Failed to logout"
      });
    }

    res.json({
      success: true
    });

  });
});


module.exports = router;