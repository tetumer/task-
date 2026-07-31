const db = require("./db");

const PRODUCTIVITY_HOURS = 24;
const POINTS_PER_SLACK_HOUR = 10;


/*
  Calculate how many hours the user has available
  for productivity.
*/
async function getProductivityHours(userId) {
  const result = await db.execute({
    sql: `
      SELECT
        sleep_hours,
        eating_hours,
        bath_hours,
        toilet_hours
      FROM profile
      WHERE user_id = ?
    `,
    args: [userId]
  });

  const profile = result.rows[0];

  if (!profile) {
    return PRODUCTIVITY_HOURS;
  }

  return Math.max(
    0,
    PRODUCTIVITY_HOURS
      - Number(profile.sleep_hours || 0)
      - Number(profile.eating_hours || 0)
      - Number(profile.bath_hours || 0)
      - Number(profile.toilet_hours || 0)
  );
}


/*
  Calculate the total estimated time of
  the user's pending tasks.
*/
async function getPlannedTaskMinutes(userId) {
  const result = await db.execute({
    sql: `
      SELECT COALESCE(SUM(duration_minutes), 0) AS total
      FROM tasks
      WHERE user_id = ?
      AND status = 'pending'
    `,
    args: [userId]
  });

  return Number(result.rows[0]?.total || 0);
}


/*
  Get today's current slack information.
*/
async function getTodaySlack(userId) {
  const availableHours = await getProductivityHours(userId);
  const plannedMinutes = await getPlannedTaskMinutes(userId);

  const availableMinutes = availableHours * 60;

  const slackMinutes = Math.max(
    0,
    availableMinutes - plannedMinutes
  );

  const slackHours = Math.floor(slackMinutes / 60);

  const potentialPenalty =
    slackHours * POINTS_PER_SLACK_HOUR;

  return {
    availableMinutes,
    availableHours,
    plannedMinutes,
    slackMinutes,
    slackHours,
    potentialPenalty
  };
}


/*
  Process yesterday's slack.

  This is called when the server receives a request
  after midnight. This makes it safe even if Render
  was sleeping at 00:00.
*/
async function processYesterdaySlack(userId) {
  const now = new Date();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const date = yesterday.toISOString().split("T")[0];

  // Check whether yesterday was already processed.
  const alreadyProcessed = await db.execute({
    sql: `
      SELECT *
      FROM slack_days
      WHERE user_id = ?
      AND date = ?
    `,
    args: [userId, date]
  });

  if (alreadyProcessed.rows.length > 0) {
    return;
  }

  /*
    For now, we use the user's current productivity
    capacity and pending tasks to calculate slack.
  */
  const slack = await getTodaySlack(userId);

  const penalty = slack.potentialPenalty;

  if (penalty > 0) {
    await db.execute({
      sql: `
        UPDATE wallet
        SET balance = MAX(0, balance - ?)
        WHERE user_id = ?
      `,
      args: [penalty, userId]
    });
  }

  // Mark this date as processed.
  await db.execute({
    sql: `
      INSERT INTO slack_days (user_id, date, penalty)
      VALUES (?, ?, ?)
    `,
    args: [userId, date, penalty]
  });

  console.log(
    `Slack processed for ${userId}: ${penalty} points`
  );
}


module.exports = {
  getTodaySlack,
  processYesterdaySlack
};