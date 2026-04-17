# Release Radar

This workspace contains two pieces:

- A browser app for connecting your Spotify account and previewing the playlist logic.
- A shell runner for unattended Friday playlist updates.

## Automatic Friday setup

For a stable local URL while signing in with Spotify, run `./serve-release-radar.sh`.
That serves the app at `http://localhost:8000/index.html` by default.

1. Open `index.html` through a local web server and connect Spotify.
2. In the app, use `Show Automation Config` after sign-in.
3. Put that JSON into `.release-radar.json` in this workspace.
4. Run `./release-radar.sh` once to confirm it works.
5. Schedule it every Friday.

After a successful run, the script can persist the chosen Spotify `playlist_id` into `.release-radar.json` so future runs can update that exact playlist directly.

## Deploying the browser app on Vercel

The browser UI in this repo is a static site, so it can be deployed directly to Vercel without a build step.

1. Push this workspace to a Git repository.
2. Import that repository into Vercel as a new project.
3. Keep the project as a static deployment with no special build command.
4. After the first production deploy, open the assigned `.vercel.app` domain.
5. In the Spotify developer dashboard, add the exact production redirect URI you plan to use, such as `https://your-project.vercel.app/` or `https://your-project.vercel.app/index.html`.

Use the same exact URL in Spotify that you will use when pressing `Connect Spotify` in production.

## Saving snapshots

This project is already tracked in git, so the current program can be saved as a commit or tag.

For future edits, run:

```bash
./save-snapshot.sh
```

That helper will:

1. Create a git commit if you have uncommitted changes.
2. Create an annotated git tag like `save-20260415-215500`.

You can also pass a custom commit message:

```bash
./save-snapshot.sh "Tune genre filtering"
```

To inspect or restore a saved point later:

```bash
git tag
git checkout save-YYYYMMDD-HHMMSS
```

The shell runner uses:

- `GET /me/tracks` to scan liked songs.
- Artists with at least `2` liked songs.
- Releases and featured appearances in the current Saturday-to-Friday window.
- All tracks from qualifying releases, plus featured tracks where the artist actually appears.
- Create-or-update behavior for a single private playlist.
- Weekly runs keep all qualifying artists, but skip individual artists or albums that keep hitting Spotify rate limits.

## Performance notes

The automated runner now keeps a local cache in `.release-radar-cache/` so future runs can be much faster than the first one.

- Liked songs are synced incrementally when possible instead of rescanning the entire library every week.
- A full liked-song rescan still runs periodically to recover from removals and keep the cache honest.
- Qualifying artists are rebuilt from the local liked-song cache each run, so that step stays local and avoids stale Spotify-facing state.
- Artist genre lookups are cached so Spotify does not need to be queried for the same artist metadata every week.
- Release results are cached per artist per week, and album track lists are cached per album.
- Progress logging is printed during long runs so you can see where the script is spending time.
