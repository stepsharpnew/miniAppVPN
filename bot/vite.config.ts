import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: "webapp/public",
  build: {
    outDir: "webapp/dist",
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/api/vpn-proxy": {
        target: "https://193-108-112-87.nip.io",
        changeOrigin: true,
        secure: false,
        rewrite: () => "/api/servers/4a2b39/clients",
        headers: {
          Authorization: `Basic ${Buffer.from("shalos:DkA8j-ddV_fN").toString("base64")}`,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
