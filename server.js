const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const session = require("express-session");
const db = require("./db");

app.use(session({
  secret: "moonstar",
  resave: false,
  saveUninitialized: false
}));


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


app.get("/", (req, res) => {
  res.sendFile(__dirname + "/home.html");
});

app.get("/addtask", (req, res) => {
  res.sendFile(__dirname + "/addtask.html");
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});

