# Snecko

Snake, but it's a roguelite. https://zeraphie.github.io/snecko/

## How to play

You control a snake. Eat the food to clear the current room.

Each time you do, the board resets into a new layout with crystal-shaped walls placed procedurally. Your snake keeps its length between rooms, so the longer you survive, the harder it gets to move without trapping yourself.

**Controls:** Arrow keys or WASD

You die if you hit a wall or yourself.

---

## Running

### Browser

Run it through a local server and open `index.html` in a browser.

### Terminal

Requires Node.js.

```bash
npm run play
```

Or if you have [just](https://github.com/casey/just?tab=readme-ov-file#installation) installed

```bash
just play
```

Works best in a larger terminal (around 120×40 or bigger). It uses Unicode block characters, so make sure your font supports them.

---

## Rules

- Eating food clears the board and generates a new one
- Each food increases your snake’s length by 1
- Each board has procedurally placed crystal wall shapes
- The number/density of obstacles increases as you progress
- Hitting a wall or your own body ends the run

---

## Architecture

No external dependencies.

The game logic is shared between environments, with rendering abstracted so it runs both in the browser (canvas) and in the terminal.
