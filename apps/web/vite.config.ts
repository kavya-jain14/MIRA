import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (command === "build" && env.VERCEL === "1") {
    const value = env.VITE_API_BASE_URL?.trim();
    if (!value) {
      throw new Error("Set VITE_API_BASE_URL on Vercel to the deployed Render origin before building MIRA.");
    }
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash ||
      /YOUR_|example/i.test(url.hostname)
    ) {
      throw new Error("VITE_API_BASE_URL must be the actual HTTPS API origin, without a path or credentials.");
    }
  }
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 4173,
      proxy: {
        "/api": {
          target: process.env.FAULTLINE_API_PROXY ?? "http://127.0.0.1:3000",
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
    },
  };
});
