import { loadConfig } from "./config";
import { openDb } from "./db";
import { createApp } from "./app";

const config = loadConfig();
const db = openDb(config.dbPath);
const app = createApp(db, config);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`plain-blog listening on port ${config.port} (${config.siteUrl})`);
  if (config.disableAuth) {
    // eslint-disable-next-line no-console
    console.warn(
      "⚠️  DISABLE_AUTH is on: the /admin area is OPEN to anyone. " +
        "Set DISABLE_AUTH=false to enforce Google sign-in."
    );
  }
});
