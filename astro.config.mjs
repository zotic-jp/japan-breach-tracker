import { defineConfig } from "astro/config";

// Served from GitHub Pages at https://zotic-jp.github.io/japan-breach-tracker/. With a custom domain later,
// set SITE_URL to it and BASE_PATH to "/".
export default defineConfig({
  site: process.env.SITE_URL ?? "https://zotic-jp.github.io",
  base: process.env.BASE_PATH ?? "/japan-breach-tracker",
  trailingSlash: "ignore",
});
