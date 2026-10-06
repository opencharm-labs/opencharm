import path from "node:path";
import { Config } from "@remotion/cli/config";

// Remotion runs from its project folder (it needs this tsconfig.json there) and compiles this file
// to CommonJS, where import.meta is empty: the working directory is apps/video, so the root is two up.
const ROOT = path.resolve(process.cwd(), "../..");

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
// three.js needs a real GPU path in headless Chrome.
Config.setChromiumOpenGlRenderer("angle");
Config.setCodec("h264");
Config.setCrf(16);
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias as Record<string, string> | undefined),
      // geist's package exports hide its font files; the film needs the files themselves.
      "geist-fonts": path.join(ROOT, "node_modules/geist/dist/fonts"),
      // The charm is drawn from the same STL files people print.
      "opencharm-stl": path.join(ROOT, "hardware/stl/view"),
    },
  },
  module: {
    ...config.module,
    rules: [
      ...(config.module?.rules ?? []),
      { test: /\.stl$/, type: "asset/resource" },
    ],
  },
}));
