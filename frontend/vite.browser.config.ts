import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import config from "./vite.config";

// Reuse the actual application's plugins/proxy; do not load developer .env files.
export default mergeConfig(config, {
  envDir: fileURLToPath(new URL("./e2e", import.meta.url)),
});
