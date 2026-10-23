// vite.config.ts
import { defineConfig } from "file:///D:/CodingContent/Web%20Development/Loom/extension/node_modules/vitest/dist/config.js";
import react from "file:///D:/CodingContent/Web%20Development/Loom/extension/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { crx } from "file:///D:/CodingContent/Web%20Development/Loom/extension/node_modules/@crxjs/vite-plugin/dist/index.mjs";

// manifest.config.ts
import { defineManifest } from "file:///D:/CodingContent/Web%20Development/Loom/extension/node_modules/@crxjs/vite-plugin/dist/index.mjs";
var manifest_config_default = defineManifest({
  manifest_version: 3,
  name: "ContextPort",
  version: "0.1.0",
  description: "Capture an AI chat as a lossless, shareable context file.",
  permissions: ["storage", "scripting", "tabs"],
  host_permissions: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://grok.com/*",
    "https://x.ai/*",
    "https://perplexity.ai/*",
    "https://www.perplexity.ai/*",
    "https://deepseek.com/*",
    "https://chat.deepseek.com/*",
    "https://*.oaiusercontent.com/*",
    "https://oaidalleapiprodscus.blob.core.windows.net/*",
    "https://*.googleusercontent.com/*",
    "https://*.anthropic.com/*",
    "https://*.twimg.com/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
    "https://*/*",
    "http://*/*"
  ],
  background: { service_worker: "src/background/index.ts", type: "module" },
  content_scripts: [
    {
      matches: [
        "https://chatgpt.com/*",
        "https://chat.openai.com/*",
        "https://claude.ai/*",
        "https://gemini.google.com/*",
        "https://grok.com/*",
        "https://x.ai/*",
        "https://perplexity.ai/*",
        "https://www.perplexity.ai/*",
        "https://deepseek.com/*",
        "https://chat.deepseek.com/*"
      ],
      js: ["src/content/index.ts"],
      run_at: "document_idle"
    }
  ],
  action: {
    default_popup: "src/popup/index.html",
    default_title: "ContextPort",
    default_icon: { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
  },
  icons: { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  ...{ optional_host_permissions: ["https://*/*", "http://*/*"] }
});

// vite.config.ts
var vite_config_default = defineConfig({
  plugins: [react(), crx({ manifest: manifest_config_default })],
  build: { target: "es2022", sourcemap: false, emptyOutDir: true },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    globals: false
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAibWFuaWZlc3QuY29uZmlnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiRDpcXFxcQ29kaW5nQ29udGVudFxcXFxXZWIgRGV2ZWxvcG1lbnRcXFxcTG9vbVxcXFxleHRlbnNpb25cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXENvZGluZ0NvbnRlbnRcXFxcV2ViIERldmVsb3BtZW50XFxcXExvb21cXFxcZXh0ZW5zaW9uXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9Db2RpbmdDb250ZW50L1dlYiUyMERldmVsb3BtZW50L0xvb20vZXh0ZW5zaW9uL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZXN0L2NvbmZpZyc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHsgY3J4IH0gZnJvbSAnQGNyeGpzL3ZpdGUtcGx1Z2luJztcbmltcG9ydCBtYW5pZmVzdCBmcm9tICcuL21hbmlmZXN0LmNvbmZpZyc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpLCBjcngoeyBtYW5pZmVzdCB9KV0sXG4gIGJ1aWxkOiB7IHRhcmdldDogJ2VzMjAyMicsIHNvdXJjZW1hcDogZmFsc2UsIGVtcHR5T3V0RGlyOiB0cnVlIH0sXG4gIHNlcnZlcjogeyBwb3J0OiA1MTczLCBzdHJpY3RQb3J0OiB0cnVlLCBobXI6IHsgcG9ydDogNTE3MyB9IH0sXG4gIHRlc3Q6IHtcbiAgICBlbnZpcm9ubWVudDogJ2pzZG9tJyxcbiAgICBpbmNsdWRlOiBbJ3Rlc3RzLyoqLyoudGVzdC50cyddLFxuICAgIGdsb2JhbHM6IGZhbHNlLFxuICB9LFxufSk7XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIkQ6XFxcXENvZGluZ0NvbnRlbnRcXFxcV2ViIERldmVsb3BtZW50XFxcXExvb21cXFxcZXh0ZW5zaW9uXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxDb2RpbmdDb250ZW50XFxcXFdlYiBEZXZlbG9wbWVudFxcXFxMb29tXFxcXGV4dGVuc2lvblxcXFxtYW5pZmVzdC5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L0NvZGluZ0NvbnRlbnQvV2ViJTIwRGV2ZWxvcG1lbnQvTG9vbS9leHRlbnNpb24vbWFuaWZlc3QuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lTWFuaWZlc3QgfSBmcm9tICdAY3J4anMvdml0ZS1wbHVnaW4nO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVNYW5pZmVzdCh7XG4gIG1hbmlmZXN0X3ZlcnNpb246IDMsXG4gIG5hbWU6ICdDb250ZXh0UG9ydCcsXG4gIHZlcnNpb246ICcwLjEuMCcsXG4gIGRlc2NyaXB0aW9uOiAnQ2FwdHVyZSBhbiBBSSBjaGF0IGFzIGEgbG9zc2xlc3MsIHNoYXJlYWJsZSBjb250ZXh0IGZpbGUuJyxcbiAgcGVybWlzc2lvbnM6IFsnc3RvcmFnZScsICdzY3JpcHRpbmcnLCAndGFicyddLFxuICBob3N0X3Blcm1pc3Npb25zOiBbXG4gICAgJ2h0dHBzOi8vY2hhdGdwdC5jb20vKicsXG4gICAgJ2h0dHBzOi8vY2hhdC5vcGVuYWkuY29tLyonLFxuICAgICdodHRwczovL2NsYXVkZS5haS8qJyxcbiAgICAnaHR0cHM6Ly9nZW1pbmkuZ29vZ2xlLmNvbS8qJyxcbiAgICAnaHR0cHM6Ly9ncm9rLmNvbS8qJyxcbiAgICAnaHR0cHM6Ly94LmFpLyonLFxuICAgICdodHRwczovL3BlcnBsZXhpdHkuYWkvKicsXG4gICAgJ2h0dHBzOi8vd3d3LnBlcnBsZXhpdHkuYWkvKicsXG4gICAgJ2h0dHBzOi8vZGVlcHNlZWsuY29tLyonLFxuICAgICdodHRwczovL2NoYXQuZGVlcHNlZWsuY29tLyonLFxuICAgICdodHRwczovLyoub2FpdXNlcmNvbnRlbnQuY29tLyonLFxuICAgICdodHRwczovL29haWRhbGxlYXBpcHJvZHNjdXMuYmxvYi5jb3JlLndpbmRvd3MubmV0LyonLFxuICAgICdodHRwczovLyouZ29vZ2xldXNlcmNvbnRlbnQuY29tLyonLFxuICAgICdodHRwczovLyouYW50aHJvcGljLmNvbS8qJyxcbiAgICAnaHR0cHM6Ly8qLnR3aW1nLmNvbS8qJyxcbiAgICAnaHR0cDovL2xvY2FsaG9zdC8qJyxcbiAgICAnaHR0cDovLzEyNy4wLjAuMS8qJyxcbiAgICAnaHR0cHM6Ly8qLyonLFxuICAgICdodHRwOi8vKi8qJyxcbiAgXSxcbiAgYmFja2dyb3VuZDogeyBzZXJ2aWNlX3dvcmtlcjogJ3NyYy9iYWNrZ3JvdW5kL2luZGV4LnRzJywgdHlwZTogJ21vZHVsZScgfSxcbiAgY29udGVudF9zY3JpcHRzOiBbXG4gICAge1xuICAgICAgbWF0Y2hlczogW1xuICAgICAgICAnaHR0cHM6Ly9jaGF0Z3B0LmNvbS8qJyxcbiAgICAgICAgJ2h0dHBzOi8vY2hhdC5vcGVuYWkuY29tLyonLFxuICAgICAgICAnaHR0cHM6Ly9jbGF1ZGUuYWkvKicsXG4gICAgICAgICdodHRwczovL2dlbWluaS5nb29nbGUuY29tLyonLFxuICAgICAgICAnaHR0cHM6Ly9ncm9rLmNvbS8qJyxcbiAgICAgICAgJ2h0dHBzOi8veC5haS8qJyxcbiAgICAgICAgJ2h0dHBzOi8vcGVycGxleGl0eS5haS8qJyxcbiAgICAgICAgJ2h0dHBzOi8vd3d3LnBlcnBsZXhpdHkuYWkvKicsXG4gICAgICAgICdodHRwczovL2RlZXBzZWVrLmNvbS8qJyxcbiAgICAgICAgJ2h0dHBzOi8vY2hhdC5kZWVwc2Vlay5jb20vKicsXG4gICAgICBdLFxuICAgICAganM6IFsnc3JjL2NvbnRlbnQvaW5kZXgudHMnXSxcbiAgICAgIHJ1bl9hdDogJ2RvY3VtZW50X2lkbGUnLFxuICAgIH0sXG4gIF0sXG4gIGFjdGlvbjoge1xuICAgIGRlZmF1bHRfcG9wdXA6ICdzcmMvcG9wdXAvaW5kZXguaHRtbCcsXG4gICAgZGVmYXVsdF90aXRsZTogJ0NvbnRleHRQb3J0JyxcbiAgICBkZWZhdWx0X2ljb246IHsgJzE2JzogJ2ljb25zL2ljb24xNi5wbmcnLCAnNDgnOiAnaWNvbnMvaWNvbjQ4LnBuZycsICcxMjgnOiAnaWNvbnMvaWNvbjEyOC5wbmcnIH0sXG4gIH0sXG4gIGljb25zOiB7ICcxNic6ICdpY29ucy9pY29uMTYucG5nJywgJzQ4JzogJ2ljb25zL2ljb240OC5wbmcnLCAnMTI4JzogJ2ljb25zL2ljb24xMjgucG5nJyB9LFxuICAuLi4oeyBvcHRpb25hbF9ob3N0X3Blcm1pc3Npb25zOiBbJ2h0dHBzOi8vKi8qJywgJ2h0dHA6Ly8qLyonXSB9IGFzIG9iamVjdCksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMlUsU0FBUyxvQkFBb0I7QUFDeFcsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsV0FBVzs7O0FDRitULFNBQVMsc0JBQXNCO0FBRWxYLElBQU8sMEJBQVEsZUFBZTtBQUFBLEVBQzVCLGtCQUFrQjtBQUFBLEVBQ2xCLE1BQU07QUFBQSxFQUNOLFNBQVM7QUFBQSxFQUNULGFBQWE7QUFBQSxFQUNiLGFBQWEsQ0FBQyxXQUFXLGFBQWEsTUFBTTtBQUFBLEVBQzVDLGtCQUFrQjtBQUFBLElBQ2hCO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0EsWUFBWSxFQUFFLGdCQUFnQiwyQkFBMkIsTUFBTSxTQUFTO0FBQUEsRUFDeEUsaUJBQWlCO0FBQUEsSUFDZjtBQUFBLE1BQ0UsU0FBUztBQUFBLFFBQ1A7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsTUFDQSxJQUFJLENBQUMsc0JBQXNCO0FBQUEsTUFDM0IsUUFBUTtBQUFBLElBQ1Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixlQUFlO0FBQUEsSUFDZixlQUFlO0FBQUEsSUFDZixjQUFjLEVBQUUsTUFBTSxvQkFBb0IsTUFBTSxvQkFBb0IsT0FBTyxvQkFBb0I7QUFBQSxFQUNqRztBQUFBLEVBQ0EsT0FBTyxFQUFFLE1BQU0sb0JBQW9CLE1BQU0sb0JBQW9CLE9BQU8sb0JBQW9CO0FBQUEsRUFDeEYsR0FBSSxFQUFFLDJCQUEyQixDQUFDLGVBQWUsWUFBWSxFQUFFO0FBQ2pFLENBQUM7OztBRGxERCxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxHQUFHLElBQUksRUFBRSxrQ0FBUyxDQUFDLENBQUM7QUFBQSxFQUNwQyxPQUFPLEVBQUUsUUFBUSxVQUFVLFdBQVcsT0FBTyxhQUFhLEtBQUs7QUFBQSxFQUMvRCxRQUFRLEVBQUUsTUFBTSxNQUFNLFlBQVksTUFBTSxLQUFLLEVBQUUsTUFBTSxLQUFLLEVBQUU7QUFBQSxFQUM1RCxNQUFNO0FBQUEsSUFDSixhQUFhO0FBQUEsSUFDYixTQUFTLENBQUMsb0JBQW9CO0FBQUEsSUFDOUIsU0FBUztBQUFBLEVBQ1g7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
