# GPX Editor

- This is the canonical GPX Editor repository. Make subsequent changes here, not in prior chat output folders.
- The application uses React with Vite and ES modules. Runtime source is in `src/`; static assets are in `public/`.
- Keep GPX processing and image export in the browser.
- Keep domain logic independent of React and Leaflet. Use EditorStore for user actions; let Leaflet own only its map container.
- Preserve Canvas rendering and avoid React updates or XML serialization on pointer-move events.
- Use Node.js 20.19+ or 22.12+. Run `npm test`, `npm run build`, and `npm run format:check` before committing.
- After every batch of code changes, regenerate the production build with `npm run build`. Keep `dist/` up to date and prepare a fresh build for publication with every code task.
- Use Semantic Commit Messages, such as `fix: ...` or `feat: ...`.
