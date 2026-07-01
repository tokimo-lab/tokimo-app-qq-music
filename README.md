# tokimo-app-qq-music

Standalone Tokimo app for QQ Music search, account playlists, public playlists, and playback.

The app uses a Rust sidecar to call QQ Music endpoints and exposes same-origin APIs to the UI. QQ login for the MVP is done by importing a `y.qq.com` cookie string into the app, matching the cookie data Listen1 desktop reads from Electron's default session.

## Features

| Feature | Description |
|---|---|
| Search | Search QQ Music songs and playlists through QQ Music web APIs. |
| Playlists | Browse public playlist details and signed-in account playlists. |
| Playback | Resolve playable song URLs and hand tracks to Tokimo media center. |
| Login | Import an existing `y.qq.com` cookie string for account playlist access. |

## Development

```bash
pnpm --dir ui install --frozen-lockfile
pnpm --dir ui build
cargo test
```

## License

MIT
