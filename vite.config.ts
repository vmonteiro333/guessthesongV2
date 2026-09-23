import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages (project site):
  // https://vmonteiro333.github.io/guessthesongV2/
  base: "/guessthesongV2/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});