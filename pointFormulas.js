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
    physicalStrength: 50, endurance: 50,
    persistence: 50, problemSolving: 50, resilience: 50,
    teamwork: 50, leadership: 50,
    riskTolerance: 50, decisionSpeed: 50,
    independence: 50
  };

  const scoreMap = {
    "4-retry": { persistence: 12 },
    "4-different": { problemSolving: 12 },
    "4-help": { teamwork: 8 },
    "4-quit": { persistence: -12 },

    "5-break": { problemSolving: 12 },
    "5-experiment": { problemSolving: 8 },
    "5-search": { problemSolving: 5 },
    "5-ask": { teamwork: 8 },

    "6-lift": { physicalStrength: 15 },
    "6-drag": { physicalStrength: -5 },

    "7-run": { endurance: 12 },
    "7-walk": { endurance: 8 },

    "8-heavy_short": { physicalStrength: 12 },
    "8-light_long": { endurance: 12 },

    "9-restart": { resilience: 15 },
    "9-recover": { problemSolving: 10 },
    "9-break": { resilience: 5 },
    "9-quit": { resilience: -12 },

    "10-alone": { independence: 15 },
    "10-team": { teamwork: 15 },

    "11-lead": { leadership: 15 },
    "11-follow": { leadership: 5 },

    "12-risk": { riskTolerance: 15 },
    "12-safe": { riskTolerance: 5 },

    "13-fast": { decisionSpeed: 15 },
    "13-think": { decisionSpeed: 5 },

    "14-remind": { teamwork: 10 },
    "14-confront": { leadership: 8 },
    "14-leader": { teamwork: 7 },
    "14-ignore": { teamwork: -5 },

    "15-easy": { endurance: 15 },
    "15-fine": { endurance: 10 },
    "15-maybe": { endurance: 5 },
    "15-no": { endurance: -5 }
  };

  results.forEach(r => {
    const key = `${r.question}-${r.answer}`;
    const changes = scoreMap[key];
    if (changes) {
      for (const trait in changes) {
        profile[trait] += changes[trait];
      }
    }
  });

  for (const key in profile) {
    profile[key] = Math.max(0, Math.min(100, profile[key]));
  }

  return profile;
}

const categoryWeights = {
  chores: { physicalStrength: 0.4, endurance: 0.4, persistence: 0.2 },
  work: { persistence: 0.25, problemSolving: 0.25, independence: 0.15, leadership: 0.15, teamwork: 0.20 },
  personal: { persistence: 0.30, resilience: 0.25, decisionSpeed: 0.15, independence: 0.30 }
};

function getProfileMultiplier(category, profile) {
  const weights = categoryWeights[category.toLowerCase()];
  if (!weights) {
    return 1.0;
  }

  let score = 0;
  for (const trait in weights) {
    score += profile[trait] * weights[trait];
  }

  return scoreToMultiplier(score);
}

function scoreToMultiplier(score) {
  const low = 0.8;
  const high = 1.5;
  const multiplier = low + (score / 100) * (high - low);
  return Math.round(multiplier * 100) / 100;
}

module.exports = {
  extractSubjectRanking,
  getSubjectMultiplier,
  getInstantTaskPoints,
  getProfileScores,
  getProfileMultiplier,
  scoreToMultiplier
};