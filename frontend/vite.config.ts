import fs from "node:fs";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if ((first === `"` && last === `"`) || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readEnvFileValue(filePath: string, key: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] !== key) {
      continue;
    }
    return stripEnvQuotes(match[2]);
  }

  return undefined;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const backendDockerEnvPath = path.resolve(__dirname, "../backend/.env.docker");
  const privyAppId =
    env.VITE_PRIVY_APP_ID ??
    process.env.VITE_PRIVY_APP_ID ??
    env.PRIVY_APP_ID ??
    process.env.PRIVY_APP_ID ??
    readEnvFileValue(backendDockerEnvPath, "PRIVY_APP_ID") ??
    "";

  return {
    define: {
      "import.meta.env.VITE_PRIVY_APP_ID": JSON.stringify(privyAppId),
    },
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
