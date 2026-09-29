import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5199, strictPort: false },
  build: {
    // Fase 11: el bundle monolítico (1,3 MB, three incluido) penaliza la
    // carga inicial. Separamos three y el vendor de React para que el
    // navegador los cachee por separado entre despliegues.
    // (Vite 8/rolldown: manualChunks solo admite forma de función.)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
          if (id.includes("node_modules/react-dom/") || id.includes("node_modules/react/")) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
})
