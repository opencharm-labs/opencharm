# tools/release

Decides each release of the CLI and the desktop app from what was merged to `main` (CONTRIBUTING, "Releasing"): the conventional-commit titles since the unit's last tag (`cli@x.y.z`, `desktop@x.y.z`), counting only the folders it ships. It returns the next version, or none, and the release notes. Git tags are the only record of versions; the code says `0.0.0`.

```bash
npm run release:next -- cli       # what main would release now (or: desktop)
npm test -w @opencharm-labs/release
```

`cli-release.yml` and `desktop-release.yml` run it after every green CI on `main`, then publish and tag. The rules (which title bumps what, which folders count) live in `src/next-release.ts` and its tests.
