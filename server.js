const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const session = require("express-session");
const db = require("./db");

// ===== AUTH ROUTES =====
app.use(session({
  secret: "moonstar",
  resave: false,
  saveUninitialized: false
}));

app.get("/register", (req, res) => {
    res.sendFile(__dirname + "/register.html");
    });

app.get("/login", (req,res)=>{
    res.sendFile(__dirname + "/login.html");
   });


   app.post("/login", express.json(), async (req, res) => {
  const { username, password} = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ? ").get(username);

  if (!user){
    return res.status(401).json({ error: "YOU NEED TO REGEISTER FIRST" });
  }

  const match = await bcrypt.compare (password, user.password);
  if (!match){
    return res.status(401).json({error: "INVALID USERNAME OR PASSWORD"});
  }

  req.session.userId = user.id;
  res.json({success: true});



});


app.post("/register", express.json(), async (req, res) => {
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


// ===== task ROUTES =====

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/home.html");
});

app.get("/addtask", (req, res) => {
  res.sendFile(__dirname + "/addtask.html");
});



app.get("/tasks", (req, res) => {
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

app.get("/quiz", (req,res) => {
  res.sendFile(__dirname + "/quiz.html");
});

app.post("/tasks", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const { title, category, difficulty, deadline, duration_minutes, steps } = req.body;

  const basePoints =
    difficulty === "instant" ? 1 :
    difficulty === "easy" ? 5 :
    difficulty === "medium" ? 10 :
    20;

  const quizRow = db.prepare("SELECT * FROM quiz_results WHERE user_id = ?").get(req.session.userId);
  let finalPoints = basePoints;

if (quizRow) {

  const results = JSON.parse(quizRow.results);

  // Keep your existing study system
  const subjectRanking = extractSubjectRanking(results);

  const studyMultiplier =
    getSubjectMultiplier(category, subjectRanking);


  // New general profile
  const profile =
    getProfileScores(results);

  const profileMultiplier =
    getProfileMultiplier(category, profile);


  /*
    Study category:
    use ONLY the existing subject system.

    Other categories:
    use the new profile system.
  */

  const isStudyCategory =
    subjectRanking.some(
      subject =>
        subject.toLowerCase() === category.toLowerCase()
    );


  if (isStudyCategory) {

    // YOUR OLD LOGIC
    finalPoints =
      Math.round(basePoints * studyMultiplier);

  }

  else {

    // NEW LOGIC
    finalPoints =
      Math.round(basePoints * profileMultiplier);

  }


  console.log("Category:", category);

  console.log("Base:", basePoints);

  console.log("Study multiplier:", studyMultiplier);

  console.log("Profile:", profile);

  console.log("Profile multiplier:", profileMultiplier);

  console.log("Final:", finalPoints);
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

app.post("/tasks/:id/complete", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(req.params.id, req.session.userId);
  if (!task) {
    return res.status(404).json({ error: "task not found" });
  }

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

  db.prepare("UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?").run(now, req.params.id);
  db.prepare("UPDATE wallet SET balance = balance + ? WHERE user_id = ?").run(finalPoints, req.session.userId);

  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json({ tasks, wallet });
});

app.delete("/tasks/:id", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(req.params.id, req.session.userId);
  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(req.session.userId);
  res.json(tasks);
});

app.post("/tasks/:taskId/steps/:stepId/complete", (req, res) => {
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
    const now = new Date().toISOString();
    const isLate = task.deadline && now > task.deadline;
    const newStatus = isLate ? "late_completed" : "completed";
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(newStatus, req.params.taskId);
  }

  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ?").all(req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json({ tasks, wallet });
});

function extractSubjectRanking(results) {
  const eliminationEntries = results.filter(r => r.type === "elimination");
  const favoriteEntry = results.find(r => r.type === "favorite_subject");

  const ranking = eliminationEntries.map(e => e.subject);
  if (favoriteEntry) {
    ranking.push(favoriteEntry.subject);
  }
  return ranking; // most hated first, most loved last
}

function getSubjectMultiplier(category, subjectRanking) {
  const totalSubjects = subjectRanking.length;
  const rankIndex = subjectRanking.findIndex(
    subject => subject.toLowerCase() === category.toLowerCase()
  );

  if (rankIndex === -1) {
    return 1.0;
  }

  const highMultiplier = 1.5;
  const lowMultiplier = 0.8;
  const range = highMultiplier - lowMultiplier;

  const multiplier = highMultiplier - (rankIndex / (totalSubjects - 1)) * range;
  return Math.round(multiplier * 100) / 100;
}
function getInstantTaskPoints(n) {
  const e = Math.E;
  return 1 / (1 + (n - 1) / e);
}

function getProfileScores(results) {

  const profile = {
    physicalStrength: 50,
    endurance: 50,

    persistence: 50,
    problemSolving: 50,
    resilience: 50,

    teamwork: 50,
    leadership: 50,

    riskTolerance: 50,
    decisionSpeed: 50,

    independence: 50
  };


  for (const r of results) {

    const answer = r.answer;


    // =========================
    // Q4 - Frustration
    // =========================

    if (r.question === 4) {

      if (answer === "retry")
        profile.persistence += 12;

      if (answer === "different")
        profile.problemSolving += 12;

      if (answer === "help")
        profile.teamwork += 8;

      if (answer === "quit")
        profile.persistence -= 12;
    }


    // =========================
    // Q5 - Problem solving
    // =========================

    if (r.question === 5) {

      if (answer === "break")
        profile.problemSolving += 12;

      if (answer === "experiment")
        profile.problemSolving += 8;

      if (answer === "search")
        profile.problemSolving += 5;

      if (answer === "ask")
        profile.teamwork += 8;
    }


    // =========================
    // Q6 - Strength
    // =========================

    if (r.question === 6) {

      if (answer === "lift")
        profile.physicalStrength += 15;

      if (answer === "drag")
        profile.physicalStrength -= 5;
    }


    // =========================
    // Q7 - Endurance
    // =========================

    if (r.question === 7) {

      if (answer === "run")
        profile.endurance += 12;

      if (answer === "walk")
        profile.endurance += 8;
    }


    // =========================
    // Q8 - Strength / Endurance
    // =========================

    if (r.question === 8) {

      if (answer === "heavy_short")
        profile.physicalStrength += 12;

      if (answer === "light_long")
        profile.endurance += 12;
    }


    // =========================
    // Q9 - Resilience
    // =========================

    if (r.question === 9) {

      if (answer === "restart")
        profile.resilience += 15;

      if (answer === "recover")
        profile.problemSolving += 10;

      if (answer === "break")
        profile.resilience += 5;

      if (answer === "quit")
        profile.resilience -= 12;
    }


    // =========================
    // Q10 - Work preference
    // =========================

    if (r.question === 10) {

      if (answer === "alone")
        profile.independence += 15;

      if (answer === "team")
        profile.teamwork += 15;
    }


    // =========================
    // Q11 - Leadership
    // =========================

    if (r.question === 11) {

      if (answer === "lead")
        profile.leadership += 15;

      if (answer === "follow")
        profile.leadership += 5;
    }


    // =========================
    // Q12 - Risk
    // =========================

    if (r.question === 12) {

      if (answer === "risk")
        profile.riskTolerance += 15;

      if (answer === "safe")
        profile.riskTolerance += 5;
    }


    // =========================
    // Q13 - Decision speed
    // =========================

    if (r.question === 13) {

      if (answer === "fast")
        profile.decisionSpeed += 15;

      if (answer === "think")
        profile.decisionSpeed += 5;
    }


    // =========================
    // Q14 - Teamwork / conflict
    // =========================

    if (r.question === 14) {

      if (answer === "remind")
        profile.teamwork += 10;

      if (answer === "confront")
        profile.leadership += 8;

      if (answer === "leader")
        profile.teamwork += 7;

      if (answer === "ignore")
        profile.teamwork -= 5;
    }


    // =========================
    // Q15 - Endurance
    // =========================

    if (r.question === 15) {

      if (answer === "easy")
        profile.endurance += 15;

      if (answer === "fine")
        profile.endurance += 10;

      if (answer === "maybe")
        profile.endurance += 5;

      if (answer === "no")
        profile.endurance -= 5;
    }

  }


  // Keep everything between 0 and 100

  for (const key in profile) {

    profile[key] = Math.max(
      0,
      Math.min(100, profile[key])
    );

  }


  return profile;
}

function getProfileMultiplier(category, profile) {

  const cat = category.toLowerCase();


  // =========================
  // CHORES
  // =========================

  if (cat === "chores") {

    const score =
      profile.physicalStrength * 0.4 +
      profile.endurance * 0.4 +
      profile.persistence * 0.2;

    return scoreToMultiplier(score);
  }


  // =========================
  // WORK
  // =========================

  if (cat === "work") {

    const score =
      profile.persistence * 0.25 +
      profile.problemSolving * 0.25 +
      profile.independence * 0.15 +
      profile.leadership * 0.15 +
      profile.teamwork * 0.20;

    return scoreToMultiplier(score);
  }


  // =========================
  // PERSONAL
  // =========================

  if (cat === "personal") {

    const score =
      profile.persistence * 0.30 +
      profile.resilience * 0.25 +
      profile.decisionSpeed * 0.15 +
      profile.independence * 0.30;

    return scoreToMultiplier(score);
  }


  // Unknown category

  return 1.0;
}

function scoreToMultiplier(score) {

  const low = 0.8;
  const high = 1.5;

  const multiplier =
    low + (score / 100) * (high - low);

  return Math.round(multiplier * 100) / 100;
}



// ===== wallet ROUTES =====

app.get("/wallet", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json(wallet);
});

app.post("/wallet/add", express.json() ,(req,res)=> {
  if(!req.session.userId){
    return res.status(401).json({error: "YOU NEED TO LOGIN FIRST"});
  }
  const {amount} = req.body;
  db.prepare("UPDATE wallet SET balance = balance + ? WHERE user_id = ?").run(amount, req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet where user_id =?").get(req.session.userId);
  res.json(wallet)
});

app.post("/wallet/subtract", express.json(), (req,res)=>{
  if(!req.session.userId){
    return res.status(401).json({error: "YOU NEED TO LOGIN FIRST"});
  }
  const {amount} = req.body;
  db.prepare("UPDATE wallet SET balance = balance - ? WHERE user_id = ?").run(amount, req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
   res.json(wallet)
});



// ====quiz route====

app.post("/quiz/submit", express.json(), (req, res) => {

  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const { results } = req.body;

  if (!Array.isArray(results)) {
    return res.status(400).json({
      error: "Invalid quiz results"
    });
  }

  const userId = req.session.userId;
  const submittedAt = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO quiz_results
    (user_id, results, submitted_at)
    VALUES (?, ?, ?)
  `).run(
    userId,
    JSON.stringify(results),
    submittedAt
  );

  const profile = {

    physical_strength: 50,
    endurance: 50,

    persistence: 50,
    problem_solving: 50,
    resilience: 50,

    teamwork: 50,
    leadership: 50,
    independence: 50,

    risk_tolerance: 50,
    decision_speed: 50

  };

  for (const result of results) {

    const q = Number(result.question);
    const answer = result.answer;


    if (q === 4) {

      if (answer === "retry")
        profile.persistence += 12;

      else if (answer === "different")
        profile.problem_solving += 12;

      else if (answer === "help")
        profile.teamwork += 8;

      else if (answer === "quit")
        profile.persistence -= 12;
    }

    if (q === 5) {

      if (answer === "break")
        profile.problem_solving += 12;

      else if (answer === "experiment")
        profile.problem_solving += 8;

      else if (answer === "search")
        profile.problem_solving += 5;

      else if (answer === "ask")
        profile.teamwork += 8;
    }

    if (q === 6) {

      if (answer === "lift")
        profile.physical_strength += 15;

      else if (answer === "drag")
        profile.physical_strength += 5;
    }

    if (q === 7) {

      if (answer === "run")
        profile.endurance += 12;

      else if (answer === "walk")
        profile.endurance += 7;
    }

    if (q === 8) {

      if (answer === "heavy_short")
        profile.physical_strength += 12;

      else if (answer === "light_long")
        profile.endurance += 12;
    }

    if (q === 9) {

      if (answer === "restart")
        profile.resilience += 15;

      else if (answer === "recover")
        profile.problem_solving += 10;

      else if (answer === "break")
        profile.resilience += 5;

      else if (answer === "quit")
        profile.resilience -= 12;
    }

    if (q === 10) {

      if (answer === "alone")
        profile.independence += 15;

      else if (answer === "team")
        profile.teamwork += 15;
    }

    if (q === 11) {

      if (answer === "lead")
        profile.leadership += 15;

      else if (answer === "follow")
        profile.leadership += 5;
    }

    if (q === 12) {

      if (answer === "risk")
        profile.risk_tolerance += 15;

      else if (answer === "safe")
        profile.risk_tolerance += 5;
    }

    if (q === 13) {

      if (answer === "fast")
        profile.decision_speed += 15;

      else if (answer === "think")
        profile.decision_speed += 5;
    }

    if (q === 14) {

      if (answer === "remind")
        profile.teamwork += 10;

      else if (answer === "confront")
        profile.leadership += 8;

      else if (answer === "leader")
        profile.leadership += 7;

      else if (answer === "ignore")
        profile.teamwork -= 5;
    }

    if (q === 15) {

      if (answer === "easy")
        profile.endurance += 15;

      else if (answer === "fine")
        profile.endurance += 10;

      else if (answer === "maybe")
        profile.endurance += 5;

      else if (answer === "no")
        profile.endurance -= 5;
    }

  }

  for (const key of Object.keys(profile)) {

    profile[key] = Math.max(
      0,
      Math.min(100, profile[key])
    );

  }

  db.prepare(`
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

  `).run(

    userId,

    profile.physical_strength,
    profile.endurance,

    profile.persistence,
    profile.problem_solving,
    profile.resilience,

    profile.teamwork,
    profile.leadership,
    profile.independence,

    profile.risk_tolerance,
    profile.decision_speed

  );

  res.json({
    success: true,
    profile
  });

});
app.get("/quiz/results", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const row = db.prepare("SELECT * FROM quiz_results WHERE user_id = ?").get(req.session.userId);
  if (!row) {
    return res.json(null);
  }
  res.json({ ...row, results: JSON.parse(row.results) });
});

// === profile route ===

app.get("/profilee", (req, res) => {
    res.sendFile(__dirname + "/profile.html");
});

app.get("/profile", (req, res) => {

  if (!req.session.userId) {
    return res.status(401).json({
      error: "Not logged in"
    });
  }

  const user = db.prepare(`
    SELECT id, name, username
    FROM users
    WHERE id = ?
  `).get(req.session.userId);


  const profile = db.prepare(`
    SELECT *
    FROM profile
    WHERE user_id = ?
  `).get(req.session.userId);


  if (!user || !profile) {
    return res.status(404).json({
      error: "Profile not found"
    });
  }


  res.json({
    user,
    profile
  });

});
//===shop route===
app.get("/shop", (req, res) => {
  res.sendFile(__dirname + "/shop.html");
});

app.get("/shop/data", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const profile = db.prepare("SELECT * FROM profile WHERE user_id = ?").get(req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json({ profile, wallet });
});

app.post("/shop/buy", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  const { item } = req.body; // "sleep", "eating", "bath", or "toilet"

  const prices = { sleep: 100, eating: 50, bath: 50, toilet: 50 };
  const maxHours = { sleep: 8, eating: 5, bath: 1, toilet: 1 };
  const column = `${item}_hours`;

  if (!prices[item]) {
    return res.status(400).json({ error: "Invalid item" });
  }

  const profile = db.prepare("SELECT * FROM profile WHERE user_id = ?").get(req.session.userId);
  const wallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);

  if (profile[column] >= maxHours[item]) {
    return res.status(400).json({ error: "Maximum reached" });
  }
  if (wallet.balance < prices[item]) {
    return res.status(400).json({ error: "Not enough points" });
  }

  db.prepare(`UPDATE profile SET ${column} = ${column} + 1 WHERE user_id = ?`).run(req.session.userId);
  db.prepare("UPDATE wallet SET balance = balance - ? WHERE user_id = ?").run(prices[item], req.session.userId);

  const updatedProfile = db.prepare("SELECT * FROM profile WHERE user_id = ?").get(req.session.userId);
  const updatedWallet = db.prepare("SELECT * FROM wallet WHERE user_id = ?").get(req.session.userId);
  res.json({ profile: updatedProfile, wallet: updatedWallet });
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});