# Loom Web Workspace Dashboard

The web workspace and viewer dashboard for **Loom** (ContextPort).

## Overview
- **3-Pane Ergonomic Layout**: Chat library on the left, high-contrast Markdown reader & transcript in the center, fidelity metrics & 1-click artifact export inspector on the right.
- **Dual Deliverable Viewer**: Seamless toggle between canonical transcript (`context.md`) and distilled 5-section AI summary (`summary.md`).
- **Rescued Media Gallery**: Lightbox inspection for diagrams, chart figures, and screenshots.
- **Companion Backend Connection**: Connects to the Loom backend engine at `http://localhost:4000` with live SSE progress updates and built-in mock fallback.

## Development

```bash
npm install
npm run dev
```

Build for production:
```bash
npm run build
npm run preview
```
