import { cloudflare } from "@cloudflare/vite-plugin";
import { lingui } from "@lingui/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({ babel: { plugins: ["@lingui/babel-plugin-lingui-macro"] } }),
    lingui(),
    cloudflare(),
  ],
  environments: {
    // Scoped to the client build: the cloudflare plugin also builds a worker
    // environment, which must not receive HTML entries.
    client: {
      build: {
        rollupOptions: {
          // Extra HTML entries are prerendered content pages (SEO): served as
          // static assets with their own <head>, no JS needed. Cloudflare's
          // html_handling maps /what-is-planning-poker to the .html file.
          input: {
            main: "index.html",
            "what-is-planning-poker": "what-is-planning-poker.html",
            "es-what-is-planning-poker": "es/what-is-planning-poker.html",
            "planning-poker-remote-teams": "planning-poker-remote-teams.html",
            "es-planning-poker-remote-teams": "es/planning-poker-remote-teams.html",
            "how-to-run-planning-poker": "how-to-run-planning-poker.html",
            "es-how-to-run-planning-poker": "es/how-to-run-planning-poker.html",
            privacy: "privacy.html",
            "404": "404.html",
          },
        },
      },
    },
  },
});
