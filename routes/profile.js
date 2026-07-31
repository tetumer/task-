const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../db");


// =========================
// GET PROFILE DATA
// =========================

router.get("/", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const userResult = await db.execute({
      sql: `
        SELECT id, name, username
        FROM users
        WHERE id = ?
      `,
      args: [req.session.userId]
    });

    const profileResult = await db.execute({
      sql: `
        SELECT *
        FROM profile
        WHERE user_id = ?
      `,
      args: [req.session.userId]
    });

    const user = userResult.rows[0];
    const profile = profileResult.rows[0];

    if (!user || !profile) {
      return res.status(404).json({
        error: "Profile not found"
      });
    }

    res.json({
      user,
      profile
    });

  } catch (err) {
    console.error("PROFILE ERROR:", err);

    res.status(500).json({
      error: "Failed to load profile"
    });
  }
});


// =========================
// PROFILE PAGE
// =========================

router.get("/page", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "profile.html"));
});


module.exports = router;