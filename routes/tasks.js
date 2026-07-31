const express = require("express");
const router = express.Router();
const db = require("../db");

const {
  extractSubjectRanking,
  getSubjectMultiplier,
  getInstantTaskPoints,
  getProfileMultiplier
} = require("../pointFormulas");


// =========================
// GET ALL TASKS
// =========================

router.get("/", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const userId = req.session.userId;

    const taskResult = await db.execute({
      sql: `
        SELECT *
        FROM tasks
        WHERE user_id = ?
        ORDER BY id
      `,
      args: [userId]
    });

    const tasks = taskResult.rows;

    const tasksWithSteps = await Promise.all(
      tasks.map(async (task) => {
        const stepResult = await db.execute({
          sql: `
            SELECT *
            FROM task_steps
            WHERE task_id = ?
            ORDER BY id
          `,
          args: [task.id]
        });

        return {
          ...task,
          steps: stepResult.rows
        };
      })
    );

    res.json(tasksWithSteps);

  } catch (err) {
    console.error("GET TASKS ERROR:", err);

    res.status(500).json({
      error: "Failed to load tasks"
    });
  }
});


// =========================
// CREATE TASK
// =========================

router.post("/", express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const {
      title,
      category,
      difficulty,
      deadline,
      duration_minutes,
      steps
    } = req.body;

    const userId = req.session.userId;

    const basePoints =
      difficulty === "instant" ? 1 :
      difficulty === "easy" ? 5 :
      difficulty === "medium" ? 10 :
      20;

    const referenceMinutes = {
      instant: 5,
      easy: 30,
      medium: 120,
      hard: 480
    };

    const timeMultiplier =
      duration_minutes / referenceMinutes[difficulty];

    const timeAdjustedPoints =
      Math.round(basePoints * timeMultiplier);


    // =========================
    // CALCULATE FINAL POINTS
    // =========================

    const quizResult = await db.execute({
      sql: `
        SELECT *
        FROM quiz_results
        WHERE user_id = ?
      `,
      args: [userId]
    });

    const quizRow = quizResult.rows[0];

    let finalPoints = timeAdjustedPoints;

    if (quizRow) {
      const results = JSON.parse(quizRow.results);

      const subjectRanking =
        extractSubjectRanking(results);

      const isStudyCategory = subjectRanking.some(
        subject =>
          subject.toLowerCase() === category.toLowerCase()
      );

      if (isStudyCategory) {

        const studyMultiplier =
          getSubjectMultiplier(
            category,
            subjectRanking
          );

        finalPoints =
          Math.round(
            timeAdjustedPoints * studyMultiplier
          );

      } else {

        const profileResult = await db.execute({
          sql: `
            SELECT *
            FROM profile
            WHERE user_id = ?
          `,
          args: [userId]
        });

        const profileRow = profileResult.rows[0];

        if (profileRow) {

          const profileMultiplier =
            getProfileMultiplier(category, {
              physicalStrength:
                profileRow.physical_strength,

              endurance:
                profileRow.endurance,

              persistence:
                profileRow.persistence,

              problemSolving:
                profileRow.problem_solving,

              resilience:
                profileRow.resilience,

              teamwork:
                profileRow.teamwork,

              leadership:
                profileRow.leadership,

              independence:
                profileRow.independence,

              riskTolerance:
                profileRow.risk_tolerance,

              decisionSpeed:
                profileRow.decision_speed
            });

          finalPoints =
            Math.round(
              timeAdjustedPoints * profileMultiplier
            );
        }
      }
    }


    const xp = finalPoints;


    // =========================
    // INSERT TASK
    // =========================

    const taskResult = await db.execute({
      sql: `
        INSERT INTO tasks (
          user_id,
          title,
          category,
          difficulty,
          deadline,
          duration_minutes,
          status,
          points,
          xp
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `,
      args: [
        userId,
        title,
        category,
        difficulty,
        deadline,
        duration_minutes,
        finalPoints,
        xp
      ]
    });

    const newTaskId =
      Number(taskResult.lastInsertRowid);


    // =========================
    // INSERT TASK STEPS
    // =========================

    if (steps && steps.length > 0) {

      const pointsPerStep =
        Math.floor(
          finalPoints / steps.length
        );

      for (const step of steps) {

        await db.execute({
          sql: `
            INSERT INTO task_steps (
              task_id,
              step_text,
              step_points,
              completed
            )
            VALUES (?, ?, ?, 0)
          `,
          args: [
            newTaskId,
            step,
            pointsPerStep
          ]
        });

      }
    }


    // =========================
    // RETURN TASKS
    // =========================

    const tasksResult = await db.execute({
      sql: `
        SELECT *
        FROM tasks
        WHERE user_id = ?
        ORDER BY id
      `,
      args: [userId]
    });

    res.json(tasksResult.rows);

  } catch (err) {
    console.error("CREATE TASK ERROR:", err);

    res.status(500).json({
      error: "Failed to create task"
    });
  }
});


// =========================
// COMPLETE TASK
// =========================

router.post("/:id/complete", express.json(), async (req, res) => {
  try {

    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const userId = req.session.userId;
    const taskId = req.params.id;

    const taskResult = await db.execute({
      sql: `
        SELECT *
        FROM tasks
        WHERE id = ? AND user_id = ?
      `,
      args: [taskId, userId]
    });

    const task = taskResult.rows[0];

    if (!task) {
      return res.status(404).json({
        error: "task not found"
      });
    }

    const { actual_minutes } = req.body;

    const slackMinutes =
      Math.max(
        0,
        actual_minutes - task.duration_minutes
      );

    let finalPoints = task.points;


    // =========================
    // INSTANT / EASY BONUS
    // =========================

    if (
      task.difficulty === "instant" ||
      task.difficulty === "easy"
    ) {

      const today =
        new Date()
          .toISOString()
          .split("T")[0];

      const todayCountResult =
        await db.execute({
          sql: `
            SELECT COUNT(*) AS count
            FROM tasks
            WHERE user_id = ?
            AND difficulty = ?
            AND completed_at LIKE ?
          `,
          args: [
            userId,
            task.difficulty,
            today + "%"
          ]
        });

      const todayCount =
        Number(todayCountResult.rows[0].count) || 0;

      const n = todayCount + 1;

      const multiplier =
        getInstantTaskPoints(n);

      finalPoints =
        Math.round(
          task.points * multiplier * 100
        ) / 100;
    }


    const now =
      new Date().toISOString();


    // =========================
    // UPDATE TASK
    // =========================

    await db.execute({
      sql: `
        UPDATE tasks
        SET
          status = 'completed',
          completed_at = ?,
          actual_minutes = ?,
          slack_minutes = ?
        WHERE id = ?
        AND user_id = ?
      `,
      args: [
        now,
        actual_minutes,
        slackMinutes,
        taskId,
        userId
      ]
    });


    // =========================
    // ADD POINTS
    // =========================

    await db.execute({
      sql: `
        UPDATE wallet
        SET balance = balance + ?
        WHERE user_id = ?
      `,
      args: [
        finalPoints,
        userId
      ]
    });


    // =========================
    // RETURN UPDATED DATA
    // =========================

    const tasksResult = await db.execute({
      sql: `
        SELECT *
        FROM tasks
        WHERE user_id = ?
        ORDER BY id
      `,
      args: [userId]
    });

    const walletResult = await db.execute({
      sql: `
        SELECT *
        FROM wallet
        WHERE user_id = ?
      `,
      args: [userId]
    });

    res.json({
      tasks: tasksResult.rows,
      wallet: walletResult.rows[0]
    });

  } catch (err) {
    console.error("COMPLETE TASK ERROR:", err);

    res.status(500).json({
      error: "Failed to complete task"
    });
  }
});


// =========================
// DELETE TASK
// =========================

router.delete("/:id", async (req, res) => {
  try {

    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const userId = req.session.userId;
    const taskId = req.params.id;


    await db.execute({
      sql: `
        DELETE FROM tasks
        WHERE id = ?
        AND user_id = ?
      `,
      args: [
        taskId,
        userId
      ]
    });


    const tasksResult = await db.execute({
      sql: `
        SELECT *
        FROM tasks
        WHERE user_id = ?
        ORDER BY id
      `,
      args: [userId]
    });

    res.json(tasksResult.rows);

  } catch (err) {
    console.error("DELETE TASK ERROR:", err);

    res.status(500).json({
      error: "Failed to delete task"
    });
  }
});


// =========================
// COMPLETE TASK STEP
// =========================

router.post(
  "/:taskId/steps/:stepId/complete",
  async (req, res) => {

    try {

      if (!req.session.userId) {
        return res.status(401).json({
          error: "Not logged in"
        });
      }

      const userId = req.session.userId;
      const taskId = req.params.taskId;
      const stepId = req.params.stepId;


      // =========================
      // CHECK TASK
      // =========================

      const taskResult = await db.execute({
        sql: `
          SELECT *
          FROM tasks
          WHERE id = ?
          AND user_id = ?
        `,
        args: [
          taskId,
          userId
        ]
      });

      const task = taskResult.rows[0];

      if (!task) {
        return res.status(404).json({
          error: "task not found"
        });
      }


      // =========================
      // CHECK STEP
      // =========================

      const stepResult = await db.execute({
        sql: `
          SELECT *
          FROM task_steps
          WHERE id = ?
          AND task_id = ?
        `,
        args: [
          stepId,
          taskId
        ]
      });

      const step = stepResult.rows[0];

      if (!step) {
        return res.status(404).json({
          error: "step not found"
        });
      }


      // =========================
      // COMPLETE STEP
      // =========================

      await db.execute({
        sql: `
          UPDATE task_steps
          SET completed = 1
          WHERE id = ?
        `,
        args: [stepId]
      });


      // =========================
      // ADD STEP POINTS
      // =========================

      await db.execute({
        sql: `
          UPDATE wallet
          SET balance = balance + ?
          WHERE user_id = ?
        `,
        args: [
          step.step_points,
          userId
        ]
      });


      // =========================
      // CHECK REMAINING STEPS
      // =========================

      const remainingResult =
        await db.execute({
          sql: `
            SELECT *
            FROM task_steps
            WHERE task_id = ?
            AND completed = 0
          `,
          args: [taskId]
        });

      const remainingSteps =
        remainingResult.rows;


      if (remainingSteps.length === 0) {

        await db.execute({
          sql: `
            UPDATE tasks
            SET status = 'completed'
            WHERE id = ?
            AND user_id = ?
          `,
          args: [
            taskId,
            userId
          ]
        });

      }


      // =========================
      // RETURN UPDATED DATA
      // =========================

      const tasksResult = await db.execute({
        sql: `
          SELECT *
          FROM tasks
          WHERE user_id = ?
          ORDER BY id
        `,
        args: [userId]
      });

      const walletResult = await db.execute({
        sql: `
          SELECT *
          FROM wallet
          WHERE user_id = ?
        `,
        args: [userId]
      });

      res.json({
        tasks: tasksResult.rows,
        wallet: walletResult.rows[0]
      });

    } catch (err) {

      console.error(
        "COMPLETE STEP ERROR:",
        err
      );

      res.status(500).json({
        error: "Failed to complete task step"
      });
    }
  }
);


module.exports = router;