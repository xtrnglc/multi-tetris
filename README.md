# Multi Tetris

Co-op Tetris for two players on one shared 20-wide well. Create a room, send the link, play.

## Develop

Requires Node 22+.

```bash
npm install
npm run dev        # server on :8080, client on http://localhost:5173
npm test           # unit + integration tests
npm run e2e        # Playwright smoke test (builds first)
npm run typecheck && npm run lint
```

Packages: `packages/engine` (pure game rules + protocol), `packages/server` (rooms, authoritative loop), `packages/client` (React + canvas UI).

## Deploy (Fly.io)

Rooms are kept in memory, so the app must run on **exactly one machine**.

One-time setup:

```bash
brew install flyctl
fly auth login
fly launch --no-deploy --copy-config --name <your-unique-app-name>   # updates fly.toml
fly deploy --ha=false
fly scale count 1
fly tokens create deploy    # add as GitHub secret FLY_API_TOKEN
```

After that, every push to `main` runs CI and deploys automatically.
