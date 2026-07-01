// utils/activity.js – User Activity Feed Engine (MongoDB Optimized)
/**
 * Adds an entry to the user's activity feed.
 * Keeps the feed capped at the 10 most recent entries.
 */
async function addActivity(db, userId, activity) {
  const timestamp = new Date().toLocaleString();
  const entry = `[${timestamp}] ${activity}`;

  // Atomic operation: Push to front and trim to last 10
  await db.client.db().collection("profiles").updateOne(
    { userId },
    {
      $push: {
        activityFeed: {
          $each: [entry],
          $position: 0,
          $slice: -10
        }
      }
    },
    { upsert: true }
  );
}

/**
 * Retrieves the activity feed for a user.
 */
async function getActivity(db, userId, limit = 10) {
  const profile = await db.client.db().collection("profiles").findOne(
    { userId },
    { projection: { activityFeed: { $slice: limit } } }
  );
  
  return profile?.activityFeed || [];
}

module.exports = { addActivity, getActivity };
