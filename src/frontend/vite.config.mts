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

function normalizeModuleId(id: string) {
  return id.replace(/\\/g, "/");
}

function isPackageMatch(id: string, patterns: string[]) {
  return patterns.some((pattern) => id.includes(`/node_modules/${pattern}`));
}

function resolveManualChunk(id: string) {
  const normalizedId = normalizeModuleId(id);
  if (!normalizedId.includes("/node_modules/")) return undefined;

  if (
    isPackageMatch(normalizedId, [
      "react-pdf",
      "pdfjs-dist",
    ])
  ) {
    return "vendor-pdf";
  }

  if (
    isPackageMatch(normalizedId, [
      "ag-grid-community",
      "ag-grid-react",
    ])
  ) {
    return "vendor-grid";
  }

  if (
    isPackageMatch(normalizedId, [
      "@xyflow/react",
      "reactflow",
      "elkjs",
    ])
  ) {
    return "vendor-flow";
  }

  if (
    isPackageMatch(normalizedId, [
      "ace-builds",
    ])
  ) {
    return "vendor-ace";
  }

  if (
    isPackageMatch(normalizedId, [
      "react-markdown",
      "remark-gfm",
      "remark-math",
      "rehype-katex",
      "rehype-raw",
      "katex",
      "unified",
      "remark-",
      "rehype-",
      "micromark",
      "mdast-",
      "hast-",
      "unist-",
      "vfile",
      "bail",
      "trough",
      "property-information",
      "space-separated-tokens",
      "comma-separated-tokens",
      "decode-named-character-reference",
      "character-entities",
      "ccount",
      "devlop",
    ])
  ) {
    return "vendor-markdown";
  }

  if (
    isPackageMatch(normalizedId, [
      "vanilla-jsoneditor",
      "svelte",
    ])
  ) {
    return "vendor-json";
  }

  if (
    isPackageMatch(normalizedId, [
      "@tanstack/react-query",
      "zustand",
      "zod",
      "axios",
      "lodash",
      "lodash-es",
      "moment",
      "moment-timezone",
      "nanoid",
      "fuse.js",
      "uuid",
      "dompurify",
      "pako",
      "whatwg-fetch",
      "base64-js",
      "emoji-regex",
      "short-unique-id",
      "pretty-ms",
      "file-saver",
    ])
  ) {
    return "vendor-app";
  }

  if (
    isPackageMatch(normalizedId, [
      "react",
      "react-ace",
      "react-sortablejs",
      "use-stick-to-bottom",
      "react-dom",
      "scheduler",
      "react-router",
      "react-router-dom",
      "@remix-run/router",
    ])
  ) {
    return "vendor-app";
  }

  if (
    isPackageMatch(normalizedId, [
      "antd",
      "@ant-design",
      "@rc-component",
      "rc-",
      "@emotion/hash",
      "@emotion/unitless",
      "stylis",
      "@radix-ui",
      "@headlessui/react",
      "@chakra-ui",
      "framer-motion",
      "cmdk",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "shadcn-ui",
      "react-hook-form",
      "@hookform/resolvers",
    ])
  ) {
    return "vendor-app";
  }

  if (
    isPackageMatch(normalizedId, [
      "@tabler/icons-react",
      "lucide-react",
      "react-icons",
    ])
  ) {
    return "vendor-icons";
  }

  if (
    isPackageMatch(normalizedId, [
      "openseadragon",
      "react-easy-crop",
      "sortablejs",
    ])
  ) {
    return "vendor-interactive";
  }

  return "vendor-app";
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
      chunkSizeWarningLimit: 2600,
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
