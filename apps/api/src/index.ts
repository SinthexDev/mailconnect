import { AppError } from "@mailconnect/domain";
import { createApp } from "./app.js";
import { loadConfig, loadDotEnv } from "./config.js";
import { createContainer } from "./container.js";

loadDotEnv();
const config = loadConfig();
const container = createContainer(config);

async function main(): Promise<void> {
  if (process.argv[2] === "bootstrap-admin") {
    const email = process.env.MAILCONNECT_ADMIN_EMAIL;
    const password = process.env.MAILCONNECT_ADMIN_PASSWORD;
    if (!email || !password) {
      console.error("MAILCONNECT_ADMIN_EMAIL und MAILCONNECT_ADMIN_PASSWORD sind erforderlich.");
      process.exit(1);
    }
    try {
      const user = await container.auth.bootstrapAdmin(email, password);
      console.log(`Admin angelegt: ${user.email}`);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "already_bootstrapped") throw error;
      console.log(error.message);
    }
    container.indexer.stop();
    container.db.close();
    return;
  }

  const app = createApp(container);
  const server = app.listen(config.port, config.host, () => {
    console.log(`MailConnect hört auf http://${config.host}:${config.port}${config.basePath || "/"}`);
  });

  const shutdown = () => {
    container.indexer.stop();
    server.close(() => {
      container.db.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
