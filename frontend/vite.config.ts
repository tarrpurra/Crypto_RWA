import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  if (mode !== "development" && !env.VITE_API_BASE_URL?.trim()) {
    throw new Error("VITE_API_BASE_URL is required for non-development builds.");
  }

  return {
    server: {
      host: "::",
      port: 8080,
      allowedHosts: [".railway.app", "localhost"],
      hmr: {
        overlay: false,
      },
      watch: {
        usePolling: true,
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
