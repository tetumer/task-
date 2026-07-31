const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../db");
const { getProfileScores } = require("../pointFormulas");


// =========================
// QUIZ PAGE
// =========================

router.get("/", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }

  res.sendFile(path.join(__dirname, "..", "quiz.html"));
});


// =========================
// SUBMIT QUIZ
// =========================

router.post("/submit", express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const { results } = req.body;

    if (!Array.isArray(results)) {
      return res.status(400).json({
        error: "Invalid quiz results"
      });
    }

    const userId = req.session.userId;
    const submittedAt = new Date().toISOString();

    // Save quiz results
    await db.execute({
      sql: `
        INSERT INTO quiz_results (
          user_id,
          results,
          submitted_at
        )
        VALUES (?, ?, ?)
        ON CONFLICT(user_id)
        DO UPDATE SET
          results = excluded.results,
          submitted_at = excluded.submitted_at
      `,
      args: [
        userId,
        JSON.stringify(results),
        submittedAt
      ]
    });


    // Calculate profile scores
    const profile = getProfileScores(results);


    // Save profile scores
    await db.execute({
      sql: `
        INSERT INTO profile (
          user_id,
          physical_strength,
          endurance,
          persistence,
          problem_solving,
          resilience,
          teamwork,
          leadership,
          independence,
          risk_tolerance,
          decision_speed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        ON CONFLICT(user_id)
        DO UPDATE SET
          physical_strength = excluded.physical_strength,
          endurance = excluded.endurance,
          persistence = excluded.persistence,
          problem_solving = excluded.problem_solving,
          resilience = excluded.resilience,
          teamwork = excluded.teamwork,
          leadership = excluded.leadership,
          independence = excluded.independence,
          risk_tolerance = excluded.risk_tolerance,
          decision_speed = excluded.decision_speed
      `,
      args: [
        userId,
        profile.physicalStrength,
        profile.endurance,
        profile.persistence,
        profile.problemSolving,
        profile.resilience,
        profile.teamwork,
        profile.leadership,
        profile.independence,
        profile.riskTolerance,
        profile.decisionSpeed
      ]
    });


    res.json({
      success: true,
      profile
    });

  } catch (err) {
    console.error("QUIZ SUBMIT ERROR:", err);

    res.status(500).json({
      error: "Failed to save quiz results"
    });
  }
});


// =========================
// GET QUIZ RESULTS
// =========================

router.get("/results", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const result = await db.execute({
      sql: `
        SELECT *
        FROM quiz_results
        WHERE user_id = ?
      `,
      args: [req.session.userId]
    });

    const row = result.rows[0];

    if (!row) {
      return res.json(null);
    }

    res.json({
      ...row,
      results: JSON.parse(row.results)
    });

  } catch (err) {
    console.error("QUIZ RESULTS ERROR:", err);

    res.status(500).json({
      error: "Failed to load quiz results"
    });
  }
});


module.exports = router;