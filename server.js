const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const session = require("express-session");
const db = require("./db");
const {
  processYesterdaySlack
} = require("./slack");

app.use(session({
  secret: "moonstar",
  resave: false,
  saveUninitialized: false
}));

app.use(async (req, res, next) => {
  try {
    if (req.session.userId) {
      await processYesterdaySlack(req.session.userId);
    }

    next();
  } catch (err) {
    console.error("Slack processing error:", err);
    next();
  }
});


const walletRoutes = require("./routes/wallet");
app.use("/wallet", walletRoutes);

const authRoutes = require("./routes/auth");
app.use("/", authRoutes);

const taskRoutes = require("./routes/tasks");
app.use("/tasks", taskRoutes);

const quizRoutes = require("./routes/quiz");
app.use("/quiz", quizRoutes);

const shopRoutes = require("./routes/shop");
app.use("/shop", shopRoutes);

const profileRoutes = require("./routes/profile");
app.use("/profile", profileRoutes);

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});


app.get("/home", (req, res) => {
  res.sendFile(__dirname + "/home.html");
});
app.get("/addtask", (req, res) => {
  res.sendFile(__dirname + "/addtask.html");
});



const { getTodaySlack } = require("./slack");

app.get("/slack", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in"
      });
    }

    const slack = await getTodaySlack(req.session.userId);

    res.json(slack);

  } catch (err) {
    console.error("Slack API error:", err);

    res.status(500).json({
      error: "Failed to calculate slack"
    });
  }
});



app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});

