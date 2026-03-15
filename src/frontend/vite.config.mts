import react from "@vitejs/plugin-react-swc";
import * as dotenv from "dotenv";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";
import {
  API_ROUTES,
  BASENAME,
  PORT,
  PROXY_TARGET,
} from "./src/customization/config-constants";

function resolveManualChunk(id: string) {
  if (!id.includes("node_modules")) return undefined;

  if (id.includes("react-pdf") || id.includes("pdfjs-dist")) {
    return "vendor-pdf";
  }

  if (id.includes("ace-builds") || id.includes("react-ace")) {
    return "vendor-editor";
  }

  if (id.includes("ag-grid")) {
    return "vendor-grid";
  }

  if (id.includes("@xyflow") || id.includes("reactflow") || id.includes("elkjs")) {
    return "vendor-flow";
  }

  if (
    id.includes("react-markdown") ||
    id.includes("remark-") ||
    id.includes("rehype-") ||
    id.includes("mathjax")
  ) {
    return "vendor-markdown";
  }

  return "vendor";
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const envLangflowResult = dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
  });

  const envLangflow = envLangflowResult.parsed || {};

  // Prefer real environment variables (e.g. from start_service_admin.py) over values
  // read from the repo-level `.env`. `dotenv.config()` won't override existing env
  // vars by default, so this enables launcher-driven builds (AUTO_LOGIN on/off).
  const getLangflowEnv = (key: string, fallback: unknown) => {
    const fromProcess = process.env[key];
    if (fromProcess !== undefined) return fromProcess;
    const fromFile = (envLangflow as Record<string, unknown>)[key];
    if (fromFile !== undefined) return fromFile;
    return fallback;
  };

  const apiRoutes = API_ROUTES || ["^/api/v1/", "^/api/v2/", "/health"];
  const target = env.VITE_PROXY_TARGET || PROXY_TARGET || "http://localhost:7860";
  const port = Number(env.VITE_PORT) || PORT || 3000;

  const proxyTargets = apiRoutes.reduce<Record<string, object>>((proxyObj, route) => {
    proxyObj[route] = {
      target,
      changeOrigin: true,
      secure: false,
      ws: true,
    };
    return proxyObj;
  }, {});

  return {
    base: BASENAME || "",
    build: {
      emptyOutDir: true,
      outDir: "build",
      rollupOptions: {
        output: {
          manualChunks: resolveManualChunk,
        },
      },
    },
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        react: path.resolve(__dirname, "node_modules/react"),
        "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      },
    },
    define: {
      "import.meta.env.BACKEND_URL": JSON.stringify(
        getLangflowEnv("BACKEND_URL", "http://localhost:7860"),
      ),
      "import.meta.env.ACCESS_TOKEN_EXPIRE_SECONDS": JSON.stringify(
        getLangflowEnv("ACCESS_TOKEN_EXPIRE_SECONDS", 60),
      ),
      "import.meta.env.CI": JSON.stringify(getLangflowEnv("CI", false)),
      "import.meta.env.LANGFLOW_AUTO_LOGIN": JSON.stringify(
        getLangflowEnv("LANGFLOW_AUTO_LOGIN", true),
      ),
      "import.meta.env.LANGFLOW_MCP_COMPOSER_ENABLED": JSON.stringify(
        getLangflowEnv("LANGFLOW_MCP_COMPOSER_ENABLED", "true"),
      ),
    },
    plugins: [react(), svgr(), tsconfigPaths()],
    server: {
      port,
      proxy: proxyTargets,
    },
  };
});
