const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../db");
const { getProfileScores } = require("../pointFormulas");

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "quiz.html"));
});

router.post("/submit", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const { results } = req.body;
  if (!Array.isArray(results)) {
    return res.status(400).json({ error: "Invalid quiz results" });
  }

  const userId = req.session.userId;
  const submittedAt = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO quiz_results (user_id, results, submitted_at)
    VALUES (?, ?, ?)
  `).run(userId, JSON.stringify(results), submittedAt);

  const profile = getProfileScores(results);

  db.prepare(`
    INSERT INTO profile (
      user_id, physical_strength, endurance, persistence, problem_solving,
      resilience, teamwork, leadership, independence, risk_tolerance, decision_speed
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
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
  `).run(
    userId,
    profile.physicalStrength, profile.endurance, profile.persistence,
    profile.problemSolving, profile.resilience, profile.teamwork,
    profile.leadership, profile.independence, profile.riskTolerance,
    profile.decisionSpeed
  );

  res.json({ success: true, profile });
});

router.get("/results", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const row = db.prepare("SELECT * FROM quiz_results WHERE user_id = ?").get(req.session.userId);
  if (!row) {
    return res.json(null);
  }
  res.json({ ...row, results: JSON.parse(row.results) });
});

module.exports = router;