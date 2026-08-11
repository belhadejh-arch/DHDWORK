import app, { setupFrontend } from "./app";
import { logger } from "./lib/logger";
import { startBackgroundJobs } from "./lib/jobs";
import { seedDatabase } from "./lib/seed";
import { runMigrations } from "./lib/migrate";

async function start() {
  // Run migrations then seed then start background jobs
  try {
    await runMigrations();
    await seedDatabase();
    startBackgroundJobs();
  } catch (err) {
    logger.error({ err }, "Error during initialization tasks");
  }

  await setupFrontend(app);

  const rawPort = process.env["PORT"] || "3000";
  const port = Number(rawPort) || 3000;

  app.listen(port, "0.0.0.0", () => {
    logger.info({ port }, `Server listening on http://0.0.0.0:${port}`);
  });
}

start().catch((err) => {
  logger.error({ err }, "Fatal error starting server");
  process.exit(1);
});
