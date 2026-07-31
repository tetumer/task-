const express = require("express");
const router = express.Router();
const db = require("../db");


// =========================
// GET WALLET
// =========================

router.get("/", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const result = await db.execute({
      sql: `
        SELECT *
        FROM wallet
        WHERE user_id = ?
      `,
      args: [req.session.userId]
    });

    res.json(result.rows[0] || null);

  } catch (err) {
    console.error("GET WALLET ERROR:", err);

    res.status(500).json({
      error: "Failed to load wallet"
    });
  }
});


// =========================
// ADD POINTS
// =========================

router.post("/add", express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "YOU NEED TO LOGIN FIRST"
      });
    }

    const { amount } = req.body;

    if (!Number.isFinite(Number(amount))) {
      return res.status(400).json({
        error: "Invalid amount"
      });
    }

    await db.execute({
      sql: `
        UPDATE wallet
        SET balance = balance + ?
        WHERE user_id = ?
      `,
      args: [
        Number(amount),
        req.session.userId
      ]
    });

    const result = await db.execute({
      sql: `
        SELECT *
        FROM wallet
        WHERE user_id = ?
      `,
      args: [req.session.userId]
    });

    res.json(result.rows[0] || null);

  } catch (err) {
    console.error("ADD WALLET ERROR:", err);

    res.status(500).json({
      error: "Failed to add points"
    });
  }
});


// =========================
// SUBTRACT POINTS
// =========================

router.post("/subtract", express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "YOU NEED TO LOGIN FIRST"
      });
    }

    const { amount } = req.body;

    if (!Number.isFinite(Number(amount))) {
      return res.status(400).json({
        error: "Invalid amount"
      });
    }

    await db.execute({
      sql: `
        UPDATE wallet
        SET balance = balance - ?
        WHERE user_id = ?
      `,
      args: [
        Number(amount),
        req.session.userId
      ]
    });

    const result = await db.execute({
      sql: `
        SELECT *
        FROM wallet
        WHERE user_id = ?
      `,
      args: [req.session.userId]
    });

    res.json(result.rows[0] || null);

  } catch (err) {
    console.error("SUBTRACT WALLET ERROR:", err);

    res.status(500).json({
      error: "Failed to subtract points"
    });
  }
});


module.exports = router;