import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    /** Prefer IPv4 — on some Windows setups “localhost” fails to connect while 127.0.0.1 works */
    host: "127.0.0.1",
    port: 5173,
  },
});
