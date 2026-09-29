import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Rollup's shared CommonJS interop helpers are a virtual module that
          // every CJS dependency imports. If it lands inside one of the vendor
          // chunks below, that chunk gets imported *back* by react-vendor and
          // the resulting cycle crashes at runtime with
          // "Cannot access '_' before initialization". Keep it standalone.
          if (id.includes("commonjsHelpers") || id.includes("commonjs-dynamic-modules")) {
            return "cjs-helpers";
          }
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("react-router")) return "react-vendor";
          if (id.includes("@tanstack")) return "query-vendor";
          if (id.includes("date-fns")) return "date-vendor";
          if (id.includes("lucide-react")) return "icons-vendor";
          // The WHOLE recharts dep graph must live in one chunk: splitting lodash
          // or victory-vendor into the generic vendor chunk creates a chunk cycle
          // and a TDZ crash ("Cannot access '_' before initialization").
          if (
            id.includes("recharts") ||
            id.includes("victory-vendor") ||
            id.includes("d3-") ||
            id.includes("internmap") ||
            id.includes("lodash") ||
            id.includes("decimal.js-light") ||
            id.includes("eventemitter3") ||
            id.includes("fast-equals") ||
            id.includes("react-smooth") ||
            id.includes("react-transition-group")
          )
            return "charts-vendor";
        },
      },
    },
  },
});
