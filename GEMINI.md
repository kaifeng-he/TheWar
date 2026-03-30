# The War - Project Overview

"The War" is a 2D PVE Real-Time Strategy (RTS) game built with React 19, TypeScript, and Vite. The game features multiple factions, resource management, building construction, and large-scale unit combat on a scrollable map.

## Core Architecture

- **Rendering Engine:** Custom HTML5 Canvas renderer (`GameCanvas.tsx`). No external game engines are used.
- **Game Logic:** Centralized in a custom hook `useGameLoop.ts` which handles state updates, movement, combat, and AI.
- **State Management:** React `useState` and `useRef` (for the game loop) to maintain high-performance updates (~60fps).
- **Type Safety:** Comprehensive TypeScript interfaces in `src/game/types.ts`.

## Key Directories

- `/the-war/src/game/`: Core definitions, types, and constants (factions, unit stats).
- `/the-war/src/hooks/`: The `useGameLoop` hook containing the main update logic.
- `/the-war/src/components/`: UI and Rendering components (e.g., `GameCanvas`).
- `/the-war/src/utils/`: Helper functions for game state initialization and manipulation.
- `/游戏想法.md`: The original design document and vision for the game.

## Tech Stack

- **Framework:** React 19 (using the new `react` and `react-dom` packages).
- **Build Tool:** Vite.
- **Language:** TypeScript.
- **Styling:** CSS (App.css, index.css).

## Development Commands

- `npm run dev`: Starts the Vite development server.
- `npm run build`: Compiles TypeScript and builds the project for production.
- `npm run lint`: Runs ESLint for code quality checks.
- `npm run preview`: Previews the production build locally.

*Note: All commands should be run from within the `/the-war` directory.*

## Game Design & Vision

As outlined in `游戏想法.md`, the goal is to create a game similar to *Command & Conquer* or *Age of Empires*:
- **Factions:** Human (Balanced), Robot (High-tech/Expensive), and Alien (Swarm/Cheap).
- **Resources:** Gold and Minerals.
- **Units:** Infantry, Tanks, Scouts, and Harvesters.
- **Buildings:** Command Centers, Barracks, Refineries, and Turrets.
- **Map:** Large, scrollable world (currently 4000x4000).

## Current Status & Roadmap

- [x] Basic Canvas rendering and Camera movement.
- [x] Unit selection and movement commands.
- [x] Basic Faction definitions and Stat constants.
- [x] Simple auto-attack combat logic.
- [ ] Implement Resource Gathering (Harvesters).
- [ ] Implement Building Construction progress and UI.
- [ ] Add Unit production from Barracks.
- [ ] Enhanced Enemy AI and Pathfinding.
- [ ] Mini-map and HUD/UI overlay.

## Coding Conventions

- **Functional Components:** Use React functional components with Hooks.
- **State Updates:** Game loop updates should be handled carefully to avoid excessive React re-renders; use `useRef` for high-frequency data and `useState` for UI-critical state.
- **Types:** Always define interfaces for new entities in `src/game/types.ts`.
- **Constants:** Keep game balance parameters in `src/game/constants.ts`.
