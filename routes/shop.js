const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../db");


// =========================
// SHOP PAGE
// =========================

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "shop.html"));
});


// =========================
// SHOP DATA
// =========================

router.get("/data", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const userId = req.session.userId;

    const profileResult = await db.execute({
      sql: "SELECT * FROM profile WHERE user_id = ?",
      args: [userId]
    });

    const walletResult = await db.execute({
      sql: "SELECT * FROM wallet WHERE user_id = ?",
      args: [userId]
    });

    const gamesResult = await db.execute({
      sql: `
        SELECT *
        FROM owned_games
        WHERE user_id = ?
        ORDER BY id
      `,
      args: [userId]
    });

    const historyResult = await db.execute({
      sql: `
        SELECT *
        FROM entertainment_history
        WHERE user_id = ?
        ORDER BY watched_at DESC
      `,
      args: [userId]
    });

    const todayResult = await db.execute({
      sql: `
        SELECT COALESCE(SUM(minutes), 0) AS minutes
        FROM entertainment_history
        WHERE user_id = ?
        AND date(watched_at) = date('now')
      `,
      args: [userId]
    });

    const profile = profileResult.rows[0];
    const wallet = walletResult.rows[0];
    const games = gamesResult.rows;
    const history = historyResult.rows;
    const today = todayResult.rows[0];

    const entertainmentToday = Number(today.minutes) || 0;

    res.json({
      profile,
      wallet,
      games,
      history,
      entertainmentToday,
      entertainmentRemaining: Math.max(
        0,
        240 - entertainmentToday
      )
    });

  } catch (err) {
    console.error("SHOP DATA ERROR:", err);

    res.status(500).json({
      error: "Failed to load shop data"
    });
  }
});


// =========================
// BUY GAME
// =========================

router.post("/buy-game", express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const { name } = req.body;
    const userId = req.session.userId;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Game name required"
      });
    }

    const gamesResult = await db.execute({
      sql: `
        SELECT *
        FROM owned_games
        WHERE user_id = ?
      `,
      args: [userId]
    });

    const games = gamesResult.rows;

    if (games.length >= 3) {
      return res.status(400).json({
        error: "You can only own 3 games. Delete one first."
      });
    }

    const walletResult = await db.execute({
      sql: "SELECT * FROM wallet WHERE user_id = ?",
      args: [userId]
    });

    const wallet = walletResult.rows[0];

    if (!wallet) {
      return res.status(400).json({
        error: "Wallet not found"
      });
    }

    const price = 50;

    if (Number(wallet.balance) < price) {
      return res.status(400).json({
        error: "Not enough points"
      });
    }

    await db.execute({
      sql: `
        INSERT INTO owned_games
        (user_id, game_name, created_at)
        VALUES (?, ?, ?)
      `,
      args: [
        userId,
        name.trim(),
        new Date().toISOString()
      ]
    });

    await db.execute({
      sql: `
        UPDATE wallet
        SET balance = balance - ?
        WHERE user_id = ?
      `,
      args: [price, userId]
    });

    const updatedWalletResult = await db.execute({
      sql: "SELECT * FROM wallet WHERE user_id = ?",
      args: [userId]
    });

    const updatedGamesResult = await db.execute({
      sql: `
        SELECT *
        FROM owned_games
        WHERE user_id = ?
        ORDER BY id
      `,
      args: [userId]
    });

    res.json({
      wallet: updatedWalletResult.rows[0],
      games: updatedGamesResult.rows
    });

  } catch (err) {
    console.error("BUY GAME ERROR:", err);

    res.status(500).json({
      error: "Failed to buy game"
    });
  }
});


// =========================
// DELETE GAME
// =========================

router.post("/delete-game", express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const { id } = req.body;
    const userId = req.session.userId;

    await db.execute({
      sql: `
        DELETE FROM owned_games
        WHERE id = ? AND user_id = ?
      `,
      args: [id, userId]
    });

    const gamesResult = await db.execute({
      sql: `
        SELECT *
        FROM owned_games
        WHERE user_id = ?
        ORDER BY id
      `,
      args: [userId]
    });

    res.json({
      games: gamesResult.rows
    });

  } catch (err) {
    console.error("DELETE GAME ERROR:", err);

    res.status(500).json({
      error: "Failed to delete game"
    });
  }
});


// =========================
// BUY ENTERTAINMENT
// =========================

router.post("/buy-entertainment", express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const userId = req.session.userId;
    const { type, title, minutes, gameId } = req.body;

    const allowedTypes = ["game", "movie", "anime"];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        error: "Invalid entertainment type"
      });
    }

    const duration = Number(minutes);

    if (!Number.isInteger(duration) || duration <= 0) {
      return res.status(400).json({
        error: "Invalid duration"
      });
    }


    // =========================
    // DAILY ENTERTAINMENT LIMIT
    // =========================

    const todayResult = await db.execute({
      sql: `
        SELECT COALESCE(SUM(minutes), 0) AS minutes
        FROM entertainment_history
        WHERE user_id = ?
        AND date(watched_at) = date('now')
      `,
      args: [userId]
    });

    const todayMinutes =
      Number(todayResult.rows[0].minutes) || 0;

    if (todayMinutes + duration > 240) {
      return res.status(400).json({
        error: `You only have ${Math.max(
          0,
          240 - todayMinutes
        )} minutes of entertainment left today.`
      });
    }


    // =========================
    // GAME OWNERSHIP
    // =========================

    if (type === "game") {
      if (!gameId) {
        return res.status(400).json({
          error: "Choose a game first"
        });
      }

      const gameResult = await db.execute({
        sql: `
          SELECT *
          FROM owned_games
          WHERE id = ? AND user_id = ?
        `,
        args: [gameId, userId]
      });

      if (!gameResult.rows[0]) {
        return res.status(400).json({
          error: "Game not found"
        });
      }
    }


    // =========================
    // PRICE
    // =========================

    const price = type === "game"
      ? Math.ceil(duration / 30) * 10
      : Math.ceil(duration / 60) * 10;


    // =========================
    // WALLET
    // =========================

    const walletResult = await db.execute({
      sql: "SELECT * FROM wallet WHERE user_id = ?",
      args: [userId]
    });

    const wallet = walletResult.rows[0];

    if (!wallet) {
      return res.status(400).json({
        error: "Wallet not found"
      });
    }

    if (Number(wallet.balance) < price) {
      return res.status(400).json({
        error: "Not enough points"
      });
    }


    // =========================
    // TITLE
    // =========================

    let finalTitle = title?.trim();

    if (type === "game") {
      const gameResult = await db.execute({
        sql: `
          SELECT game_name
          FROM owned_games
          WHERE id = ? AND user_id = ?
        `,
        args: [gameId, userId]
      });

      const game = gameResult.rows[0];

      if (!game) {
        return res.status(400).json({
          error: "Game not found"
        });
      }

      finalTitle = game.game_name;
    }

    if (!finalTitle) {
      return res.status(400).json({
        error: "Name required"
      });
    }


    // =========================
    // SAVE ENTERTAINMENT
    // =========================

    await db.execute({
      sql: `
        INSERT INTO entertainment_history
        (user_id, type, title, minutes, points, watched_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        userId,
        type,
        finalTitle,
        duration,
        price,
        new Date().toISOString()
      ]
    });


    // =========================
    // REMOVE POINTS
    // =========================

    await db.execute({
      sql: `
        UPDATE wallet
        SET balance = balance - ?
        WHERE user_id = ?
      `,
      args: [price, userId]
    });


    // =========================
    // RETURN UPDATED DATA
    // =========================

    const updatedWalletResult = await db.execute({
      sql: "SELECT * FROM wallet WHERE user_id = ?",
      args: [userId]
    });

    const historyResult = await db.execute({
      sql: `
        SELECT *
        FROM entertainment_history
        WHERE user_id = ?
        ORDER BY watched_at DESC
      `,
      args: [userId]
    });

    const entertainmentToday = todayMinutes + duration;

    res.json({
      wallet: updatedWalletResult.rows[0],
      history: historyResult.rows,
      entertainmentToday,
      entertainmentRemaining: Math.max(
        0,
        240 - entertainmentToday
      )
    });

  } catch (err) {
    console.error("BUY ENTERTAINMENT ERROR:", err);

    res.status(500).json({
      error: "Failed to purchase entertainment"
    });
  }
});


// =========================
// BUY LIFESTYLE ITEM
// =========================

router.post("/buy", express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const { item } = req.body;

    const items = {
      sleep:  { price: 30, amount: 1,   max: 8 },
      eating: { price: 20, amount: 1,   max: 5 },
      bath:   { price: 15, amount: 0.5, max: 1 },
      toilet: { price: 15, amount: 0.5, max: 1 }
    };

    if (!items[item]) {
      return res.status(400).json({
        error: "Invalid item"
      });
    }

    const { price, amount, max } = items[item];

    const column = `${item}_hours`;
    const userId = req.session.userId;


    // =========================
    // GET PROFILE + WALLET
    // =========================

    const profileResult = await db.execute({
      sql: "SELECT * FROM profile WHERE user_id = ?",
      args: [userId]
    });

    const walletResult = await db.execute({
      sql: "SELECT * FROM wallet WHERE user_id = ?",
      args: [userId]
    });

    const profile = profileResult.rows[0];
    const wallet = walletResult.rows[0];

    if (!profile) {
      return res.status(400).json({
        error: "Profile not found"
      });
    }

    if (!wallet) {
      return res.status(400).json({
        error: "Wallet not found"
      });
    }


    // =========================
    // LIMIT CHECK
    // =========================

    if (Number(profile[column]) + amount > max) {
      return res.status(400).json({
        error: "Maximum reached"
      });
    }


    // =========================
    // BALANCE CHECK
    // =========================

    if (Number(wallet.balance) < price) {
      return res.status(400).json({
        error: "Not enough points"
      });
    }


    // =========================
    // UPDATE PROFILE
    // =========================

    await db.execute({
      sql: `
        UPDATE profile
        SET ${column} = ${column} + ?
        WHERE user_id = ?
      `,
      args: [amount, userId]
    });


    // =========================
    // UPDATE WALLET
    // =========================

    await db.execute({
      sql: `
        UPDATE wallet
        SET balance = balance - ?
        WHERE user_id = ?
      `,
      args: [price, userId]
    });


    // =========================
    // RETURN UPDATED DATA
    // =========================

    const updatedProfileResult = await db.execute({
      sql: "SELECT * FROM profile WHERE user_id = ?",
      args: [userId]
    });

    const updatedWalletResult = await db.execute({
      sql: "SELECT * FROM wallet WHERE user_id = ?",
      args: [userId]
    });

    res.json({
      profile: updatedProfileResult.rows[0],
      wallet: updatedWalletResult.rows[0]
    });

  } catch (err) {
    console.error("BUY ITEM ERROR:", err);

    res.status(500).json({
      error: "Failed to purchase item"
    });
  }
});


module.exports = router;