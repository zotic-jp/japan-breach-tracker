import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://japan-breach-tracker.pages.dev",
  trailingSlash: "ignore",
});
