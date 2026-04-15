# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the Vue 3 frontend for the Tauri app. Keep page-level windows in `src/views/`, shared UI in `src/components/`, reusable logic in `src/composables/`, and non-UI helpers in `src/lib/`. Static assets live in `src/assets/` and `public/`.

`src-tauri/` contains the Rust backend. Core commands and platform integrations live in `src-tauri/src/` with snake_case modules such as `commands.rs`, `db.rs`, and `screenshot.rs`. App capabilities, generated schemas, and icons stay under `src-tauri/capabilities/`, `src-tauri/gen/`, and `src-tauri/icons/`.

`website/` is the Docusaurus documentation site. Put docs in `website/docs/`, React pages/components in `website/src/`, and static files in `website/static/`.

## Build, Test, and Development Commands
Use `pnpm install` at the repo root to install app dependencies.

- `pnpm dev`: start the Vite frontend only.
- `pnpm tauri dev`: run the desktop app with the Rust backend.
- `pnpm build`: type-check the Vue app and build production frontend assets.
- `pnpm lint`: run ESLint with auto-fixes for `.ts`, `.tsx`, and `.vue`.
- `pnpm format`: run Prettier on frontend source files.
- `pnpm release`: run the release helper in `scripts/release.mjs`.
- `cd website && pnpm install && pnpm start`: run the docs site locally.
- `cd website && pnpm build`: build the documentation site.

## Coding Style & Naming Conventions
Prettier enforces 2-space indentation, semicolons, single quotes, trailing commas, and a 100-column wrap. Vue single-file components use PascalCase filenames such as `MainWindow.vue`; composables use `useX.ts`; Rust modules use snake_case. Prefer small, focused modules and keep platform-specific logic in Rust when it touches OS APIs.

## Testing Guidelines
There is no dedicated JS test runner configured yet. Before opening a PR, run `pnpm lint`, `pnpm build`, and smoke-test `pnpm tauri dev`. For docs-only changes, run `cd website && pnpm build`. If you add Rust logic with isolated behavior, include `cargo test` coverage in `src-tauri/` where practical.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes such as `fix:`, `docs:`, and `chore:`. Keep commits scoped and imperative, for example `fix: handle empty clipboard image`. PRs should describe user-visible changes, list verification steps, link related issues, and include screenshots or recordings for UI updates to the popup, settings, screenshot, or docs pages.
