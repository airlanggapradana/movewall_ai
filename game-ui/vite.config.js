import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.fbx"],
  build: {
    rollupOptions: {
      input: {
        app: "index.html",
        r3f: "r3f.html",
      },
    },
  },
});
