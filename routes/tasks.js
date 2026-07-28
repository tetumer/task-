const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../db");
const {
  extractSubjectRanking,
  getSubjectMultiplier,
  getInstantTaskPoints,
  getProfileMultiplier
} = require("../pointFormulas");

router.get("/", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(req.session.userId);
  const tasksWithSteps = tasks.map(task => {
    const steps = db.prepare("SELECT * FROM task_steps WHERE task_id = ?").all(task.id);
    return { ...task, steps };
  });
  res.json(tasksWithSteps);
});

router.post("/", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const { title, category, difficulty, deadline, duration_minutes, steps } = req.body;

  const basePoints =
    difficulty === "instant" ? 1 :
    difficulty === "easy" ? 5 :
    difficulty === "medium" ? 10 :
    20;
    const referenceMinutes = { instant: 5, easy: 30, medium: 120, hard: 480 };
    const timeMultiplier = duration_minutes / referenceMinutes[difficulty];
    const timeAdjustedPoints = Math.round(basePoints * timeMultiplier);

  const quizRow = db.prepare("SELECT * FROM quiz_results WHERE user_id = ?").get(req.session.userId);
  let finalPoints = timeAdjustedPoints;

  if (quizRow) {
    const results = JSON.parse(quizRow.results);
    const subjectRanking = extractSubjectRanking(results);
    const isStudyCategory = subjectRanking.some(
      subject => subject.toLowerCase() === category.toLowerCase()
    );

    if (isStudyCategory) {
      const studyMultiplier = getSubjectMultiplier(category, subjectRanking);
      finalPoints = Math.round(timeAdjustedPoints * studyMultiplier);
    } else {
      const profileRow = db.prepare("SELECT * FROM profile WHERE user_id = ?").get(req.session.userId);
      if (profileRow) {
        const profileMultiplier = getProfileMultiplier(category, {
          physicalStrength: profileRow.physical_strength,
          endurance: profileRow.endurance,
          persistence: profileRow.persistence,
          problemSolving: profileRow.problem_solving,
          resilience: profileRow.resilience,
          teamwork: profileRow.teamwork,
          leadership: profileRow.leadership,
          independence: profileRow.independence,
          riskTolerance: profileRow.risk_tolerance,
          decisionSpeed: profileRow.decision_speed
        });
        finalPoints = Math.round(timeAdjustedPoints * profileMultiplier);
      }
    }
  }

  const xp = finalPoints;

  const stmt = db.prepare(`
    INSERT INTO tasks (user_id, title, category, difficulty, deadline, duration_minutes, status, points, xp)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `);
  const result = stmt.run(req.session.userId, title, category, difficulty, deadline, duration_minutes, finalPoints, xp);
  const newTaskId = result.lastInsertRowid;

  if (steps && steps.length > 0) {
    const pointsPerStep = Math.floor(finalPoints / steps.length);
    const stepStmt = db.prepare(`
      INSERT INTO task_steps (task_id, step_text, step_points, completed)
      VALUES (?, ?, ?, 0)
    `);
    steps.forEach(step => {
      stepStmt.run(newTaskId, step, pointsPerStep);
    });
  }

  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(req.session.userId);
  res.json(tasks);
});

router.post("/:id/complete", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(req.params.id, req.session.userId);
  if (!task) {
    return res.status(404).json({ error: "task not found" });
  }

  const { actual_minutes } = req.body;
  const slackMinutes = Math.max(0, actual_minutes - task.duration_minutes);

  let finalPoints = task.points;

  if (task.difficulty === "instant" || task.difficulty === "easy") {
    const today = new Date().toISOString().split("T")[0];
    const todayCount = db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE user_id = ? AND difficulty = ? AND completed_at LIKE ?
    `).get(req.session.userId, task.difficulty, today + "%").count;

    const n = todayCount + 1;
    const multiplier = getInstantTaskPoints(n);
    finalPoints = Math.round(task.points * multiplier * 100) / 100;
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks SET status = 'completed', completed_at = ?, actual_minutes = ?, slack_minutes = ?
    WHERE id = ?
  `).run(now, actual_minutes, slackMinutes, req.params.id);

  db.prepare("UPDATE wallet SET balance = balance + ? WHERE user_id = ?").run(finalPoints, req.session.userId);

  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json({ tasks, wallet });
});

router.delete("/:id", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(req.params.id, req.session.userId);
  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(req.session.userId);
  res.json(tasks);
});

router.post("/:taskId/steps/:stepId/complete", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(req.params.taskId, req.session.userId);
  if (!task) {
    return res.status(404).json({ error: "task not found" });
  }
  const step = db.prepare("SELECT * FROM task_steps WHERE id = ? AND task_id = ?").get(req.params.stepId, req.params.taskId);
  if (!step) {
    return res.status(404).json({ error: "step not found" });
  }

  db.prepare("UPDATE task_steps SET completed = 1 WHERE id = ?").run(req.params.stepId);
  db.prepare("UPDATE wallet SET balance = balance + ? WHERE user_id = ?").run(step.step_points, req.session.userId);

  const remainingSteps = db.prepare("SELECT * FROM task_steps WHERE task_id = ? AND completed = 0").all(req.params.taskId);
  if (remainingSteps.length === 0) {
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(req.params.taskId);
  }

  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json({ tasks, wallet });
});

module.exports = router;