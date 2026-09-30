# ROV Overlay Tool v3: Plan and Decisions

This is the working design document for v3. It is written to stand alone: a fresh
session with no conversation history should be able to continue from here and
`CLAUDE.md`. The v2 design history is kept, read-only, in `docs/v2/`.

---

## 0. Where things stand

**Last updated 2026-09-30: 3.2.2 released (see "3.2.2 released" below); 3.2.0 and 3.2.1 released the same day. The app is renamed **Nuzka** (§1). Supporter keys S1-S3 done (§10), ready to ship together once the user has seen the watermark in OBS and chosen prices. Before that, 2026-09-27: S1, S2. Before that, 2026-09-14. M1 `e826fb3`, M2 `6f736b3`, M3 `ab3bdf8`, M4 `c3ac12a`, M5 `3fcb2a9`, M6 `c615d39`, M7 `79c5f41`, M8 `7e13667`, 3.0.6 and 3.0.7 in the commits after those, the flow and UI work in `83e558c`, 3.0.8 in `182ea91`.**

| Area | State |
|---|---|
| Backend (`backend/`) | Copied from v2 at `6c69766` (v2.0.2 plus two overlay commits). Builds; **373 tests, all passing, nothing skipped**. M6 added the v2 importer; M7 revived the "installer never ships uploaded images" guard; M8 added `tests/packaging.test.ts`, which keeps the bundle's page list honest in both directions. |
| Desktop app (`desktop/`) | WPF on .NET 10. Builds with no warnings. Starts or attaches to the backend, live title strip, sidebar, OBS source list, toasts, Thai/English, back stack (Esc / mouse back), notice bell, first-run licence. |
| Native screens | **All of them**: Home, tournament detail, team registry, team profile, Control Panel, bracket, analytics, pick/ban history, Design, Hotkeys, Guide, Settings. No screen opens a web page any more, and since M8 the installer no longer carries the ten HTML operator pages they replaced. The manual (`/guide`) and the sound check (`/sfx-test`) still ship: nothing replaced those, and the Guide screen has a button that opens the manual in a browser. |
| Verified how | Every native screen rendered with seeded data (--snapshot, §3) in both languages; anything in its own window cannot be (§8), which is how 3.0.0 shipped unable to open one at all. 3.0.5 has been **installed from its own Setup and watched opening a real window**, serving its overlays and answering 410 on the pages the installer drops. The v2 import runs against a synthetic v2 install in the tests, with the v2 folder asserted byte-identical afterwards. The **game-over flow has been clicked through for real**: on 2026-09-14 with the GAME OVER buttons, and again on 2026-09-15 after they became **+1** on the score - `scripts/uia.ps1` pressed +1 twice and Put on air in a live window against a throwaway backend, checked there was no dialog, that the server recorded 1-0 then 2-0 with the series complete and no game 3, and that the panel read "PSG Esports win the series 2–0". The other clicking flows are still unverified (§8). |
| Updates / notifications | **Built** (§5). Velopack 1.2.0 against GitHub Releases, applied when the app closes and never on its own; a notice feed with a bell in the title bar. |

Next: whatever the people using it ask for. 3.0.5 through **3.0.9** are published. New
versions reach people on their own, but from 3.0.9 they are only *installed* when the
operator presses Update now (§5). **3.0.10** (2026-09-15): GAME OVER's two "won"
buttons and their confirmation are gone (user's request). The winner is counted
from the score: a **+1** beside each team's score ends the game for that side through the same
`POST /api/live-match/finish`, which now also returns `seriesWinner` and `score`, and the
SERIES OVER bar names the winner ("PSG Esports win the series 2–1"). Typing in the score box
still only corrects the number.

**3.0.11: teams swap sides every game** (user's request, 2026-09-15; clicked through for real),
on by default, switchable beside ROUND (`state.swapSidesEachRound`, carried over like `sfx`;
socket `setSwapSides`). Tournament games: `goLive` puts team B on blue for even game numbers
and flips the restored draft and the series score to match. **The frozen game copy is not
changed** - it still says team A = blue - so draft capture, score sync and the previous-rounds
board, which all go through `orientationOf`, credit the right team exactly as they already did
for a manual Switch Teams. Quick matches: `stepRound` swaps the two team objects on every step,
and `restoreRound` places a filed draft by team name. Tested in `tests/side-swap.test.ts`.

**3.1.2: Settings lost two sections** (user's request, 2026-09-16): "Your
data" (the data and media folder paths with Open folder buttons) and "Bring your v2 data across"
(the v2 importer's only UI). Both were judged unnecessary. **The v2 importer's server side stays**
(`http://api-import.ts`, `domain/import-v2.ts`, `tests/import-v2.test.ts`) - only the screen is gone,
so restoring the box is a XAML + view-model change, not a rebuild. Anyone moving from v2 now saves a
backup there and restores it here, which both guides say instead of the old import steps; the guide
still lists the folder paths under "Where your files are". `Loc.M6.cs` is deleted and the
`Settings.Data*` / `Settings.OpenFolder` keys with it.

**3.1.1: team card graphic** (user's request, 2026-09-15).
`/overlay-team-card` shows one team for the break before a match: logo and name, five tiles
(series, games, on blue, on red, last five series), most picked heroes with win rates, heroes
banned against them, and each player's favourite heroes. Data is `GET /api/team-card`, which
wraps `teamStats.forTeam`, the same numbers as the team page's Statistics tab. **It follows a
side, not a team** (`?side=blue|red`, read from `state.team*.logo.src`, the registry id that
`goLive` and `loadTeamIntoSide` put there), because teams swap sides every game; the page reloads
when the id on its side changes in `stateUpdate`, never on every state push. `?team=<id>` pins a
team; `?tournament=<id>|all`, default the on-air match's tournament. A typed-in side or an unusable
`?team=` is a 404 and the page clears the old card rather than leaving it under the message. It
reuses `overlay-matchup.css` for panels, entrance and 1440p scaling, plus `overlay-team-card.css`.
Two OBS list rows (blue, red) in both lists. Tested in `tests/team-card.test.ts`.

**3.1.1 also: two overlay fixes** (user's request, 2026-09-15, found by
photographing every overlay against the 5 × 32 test data). **Head to head and Team picks & bans
coloured the teams by bracket side, not screen side:** following the match on air they took team A
as blue, so since sides swap every game (3.0.11) every even game, and any game after Switch Teams,
had the colours backwards against the main overlay. `liveTeamsOnScreen()` in `live-match.ts` returns
the on-air pair ordered by `isDisplaySwapped` (the same check draft capture uses) and both endpoints
use it; a test asserts the team card, `/api/matchup` and `/api/team-drafts` agree with
`state.teamBlue` in games 1 and 2. **Standings was unreadable for big tables:** `fitToStage` shrank
the whole board with `transform`, so width shrank too and a 32-team knockout became a narrow strip.
It now steps a `--st-font` variable down from 34px to the largest size that fits, and only then
shrinks; a lone group of more than 12 rows splits into two side-by-side tables with ranks
continuing; a format without groups is labelled "All teams", not "Group main". Checked in the
Browser pane: 32 teams at 20px in two tables, four groups of four at 31px, neither transformed.

**3.1.0: hotkeys on by default, with the score and the rounds** (user's request,
2026-09-15). Six new `GLOBAL_HOTKEY_ACTIONS`: `bluePlus` / `redPlus` (Ctrl+Alt+1 / 2), `blueMinus`
/ `redMinus` (Ctrl+Alt+Q / W), `prevRound` / `nextRound` (Ctrl+Alt+A / S): **a 2×3 block under the
left hand holding Ctrl+Alt**, blue left and red right like the screen. The first layout
(Ctrl+Alt+Shift+digits, Ctrl+Alt+PageUp / PageDown) was rejected by the user: too far apart to
press with one hand while the other stays on the mouse in OBS. The user then asked for **every**
system-wide key to follow it, so the draft keys moved too: `prevPhase` / `nextPhase` Ctrl+Alt+E / R,
`pauseResume` Ctrl+Alt+D, `toggleBanner` Ctrl+Alt+F, `undo` stays Ctrl+Alt+Z. The old H / Space /
arrows needed two hands, and Ctrl+Alt+Space was already held by another program on the user's
machine. **`globalHotkeys.layout` (now 2)** moves saved bindings still equal to the layout-1 defaults
to the new ones exactly once; keys someone chose stay, and the stamp stops a later deliberate
Ctrl+Alt+H from being moved again. Keep new defaults inside the block.
**Trap found by pressing the keys for real:** with the app in focus, a system-wide Ctrl+Alt key
also toggled the banner through the Control Panel's local "tap Alt" shortcut. `RegisterHotKey`
swallows the letter's key press but not the modifier releases, so the panel saw Alt go down and up
and counted a tap; Ctrl+Alt+F flipped the banner twice and looked dead. `ControlView` now arms a
tap only when no other modifier is held, and any ordinary key release cancels it.
The score and round keys call `finishGame`,
`undoGame` and `stepRound`, the same functions as the buttons, and **blue/red is the side on
screen when pressed**, like the buttons (so after a +1 and a side swap, the winner's -1 is the
other colour; the Hotkeys page and the guide say so). `POST /api/global-hotkeys/fire` now returns
`{ ok, changed, code?, error?, finish?, undo? }`, always 200 for a refusal. **The finish/undo
result has to reach the Control Panel**: its SERIES OVER bar and "Put on air" next match are built
from the +1 reply, so a series ended from OBS would otherwise be recorded with no bar. The
desktop host raises `AppServices.HotkeyFired`; `ControlViewModel` shows it through the same
`ShowFinished` as its button and sets `Handled`; anything unhandled (refusals, rounds) is toasted
by the host through `GameFlowText`, which both now share. `FinishGameResult` / `UndoGameResult`
gained `teamName`, read before the sides swap, because the host has no name in hand. Hotkeys
recording learned PageUp/PageDown, Home/End, Insert/Delete, F1–F24 and the numpad. System-wide
keys are now **on by default and called just "Hotkeys"** (user's request): first section of the
Hotkeys page, with the Control Panel's own keys below. Saved settings from before layout 2 are
switched on as they migrate (off was the default then, so an off from those versions says nothing);
once stamped, switching them off sticks. This reverses v2's "off until asked for" rule, and
`backend/CLAUDE.md` says so. Tested in `tests/global-hotkeys.test.ts`.

**3.0.13: full team statistics** (user's request, 2026-09-15; smoke-tested before packing). The team
page has Profile / Statistics tabs; Statistics shows series and games records with win rates,
the last five series, side records, heroes picked (games, pick rate, win rate), bans made,
bans against, record vs each opponent and each player's hero pool, all filterable to one
tournament (`GET /api/teams/:id/stats[?tournamentId=]`, `store/team-stats.ts`, same counting
rules as analytics: locked drafts only, sides from the frozen copy, win rates from decided
games). **Migration step 6** adds `games.sides_swapped` and a `game_players` table, written by
`captureDraft` with every draft, because neither the side a team actually played on screen nor
who sat in each row was recorded anywhere. **Both count only from 3.0.13 on**; earlier games
show as "side unknown" and have no player pool, never guessed. Backups carry both fields
(optional, so older backup files still restore; `BACKUP_VERSION` unchanged). Tested in
`tests/team-stats.test.ts` and `tests/backup.test.ts`. The snapshot switch `--then stats`
opens a team's Statistics tab.

**3.0.12 (2026-09-15; clicked through for real, including -1 disabled at 0):**

- **-1 beside each score** (`POST /api/live-match/undo`, `undoGame`): the exact undo of +1.
  Lowers the score through `pushOverlayScoreToMatch`, so the game's winner is cleared and a
  series that point had ended is reopened with its winner pulled back out of the next match,
  then `goLive`s that game back with its draft and sides. **Refuses unless it is the most
  recent game** (`not-last`), because undoing an older game renumbers the games and the next
  draft would overwrite a game that was played; refuses at 0 (`no-points`), and the button
  is disabled at 0 from the server's score, not the text box.
- **Fixed: a correction left stale game winners in later matches.** Reproduced first: correct a
  semifinal after the final was played, and the bracket reset the final to 0-0 while its game
  kept `winner = blue`, so hero win rates, the team view, Head to head and Pick / ban history
  all still credited the team that had been removed. `wipeResult` in `store/matches.ts` now
  clears the winners of the games of every match it resets (drafts kept, so pick/ban rates
  still count what was played), and `recordSeriesResult` announces `games` whenever the series
  winner changes so Analytics refreshes.

**Notices for 3.1.1** (2026-09-16, both expire 2026-10-16) replaced the 3.1.0 pair with the
same split: `update-3-1-1` (3.0.9–3.1.0, press Update now) and `update-3-1-1-older`
(3.0.8 and older, goes in on close).

**Notices for 3.1.0** (2026-09-15, both expire 2026-10-15) replaced the 3.0.13 pair with the
same split: `update-3-1-0` (3.0.9–3.0.13, press Update now) and `update-3-1-0-older`
(3.0.8 and older, goes in on close).

**Notices for 3.0.13** (2026-09-15, both expire 2026-10-15) replaced the 3.0.12 pair with the
same split: `update-3-0-13` (3.0.9–3.0.12, press Update now) and `update-3-0-13-older`
(3.0.8 and older, goes in on close).

**Notices for 3.0.12** (2026-09-15, both expire 2026-10-15) replaced the 3.0.11 pair with the
same split: `update-3-0-12` (3.0.9–3.0.11, press Update now) and `update-3-0-12-older`
(3.0.8 and older, goes in on close).

**Notices for 3.0.11** (2026-09-15, both expire 2026-10-15) replaced the 3.0.8 one, and are
**split by version because the install step differs**: `update-3-0-11` (3.0.9–3.0.10) says to
press Update now, since those builds never install by themselves; `update-3-0-11-older`
(3.0.8 and older) says it goes in on close, which is still true of those builds. A future
update notice needs the same split for as long as anyone may still be on 3.0.8 or older. 3.0.8 carries the flow and UI work: one-press GAME OVER with SERIES
OVER and Put on air (`POST /api/live-match/finish`), a Control Panel whose team setup and sound
fold away, and a Home that shows what is on air and what is ready to play
(`GET /api/ready-matches`). It was smoke-tested for real before packing. Its notice
(`update-3-0-8`, for 3.0.7 and older, expires 2026-10-15) replaced the 3.0.6 one in
`notices.json` on 2026-09-14.

---

## 1. Confirmed decisions

Settled with the user on 2026-09-11. Do not re-litigate.

- **v3 is a new app in its own folder** (`rov_overlay_v3`). **`../rov_pickban_overlay`
  (v2) is never modified**: no builds, no `npm start`, no edits. Read from it only.
  Running `npm start` there rebuilds its `build/` and opens its database.
- **The app is called Nuzka** (user's choice, 2026-09-28): one casual, made-up word that
  searches showed was barely used (only a GitHub username), and no "ROV" in the name, which
  is Garena's trademark; "for Arena of Valor (RoV)" goes in descriptions instead. Only what
  people *see* was renamed: window title, title bar, installer title (`--packTitle`),
  watermark, licence, messages, guide, README. **The IDs stay**: packId `RovOverlayTool3`,
  `RovOverlayTool.exe`, `%APPDATA%\RovOverlayTool3`, the `rov_overlay_v3` repo and its
  update feed, `APP_ID` `rov-overlay-v3`, so installed copies keep updating and keep their
  data. **"ROV Overlay Tool" stays wherever it names v2**, which really has that name: the
  v2 importer, "most likely ROV Overlay Tool v2" on a busy port, the guide's moving-from-v2
  section. The unshipped HTML operator pages were left alone.
- **The overlays stay HTML/CSS/JS**, served to OBS as browser sources, unchanged from v2.
- **The operator UI is native C#** (WPF). The user picked native over a React shell
  inside Electron.
- **The look is a pro broadcast tool**: dense, dark, lots on screen, like OBS, vMix or
  Discord. The v2 colour rules carry over (gold = happening now, blue/red = game sides).
- **Same functionality as v2, better UI.** Nothing is dropped; every v2 page either
  gets a native screen or stays reachable as its HTML page until it does.
- **Future: real-time patches and notifications to users** (§5). Built in later
  milestones, but designed now so nothing blocks them.
- **The tournament page keeps its OBS source list** (decided 2026-09-14). v2 removed it
  from `/tournament/:id` on 2026-09-08 at the user's request, and `backend/CLAUDE.md` still
  says so; asked again for v3, the user chose to keep the per-tournament links (Standings,
  Team list, Stats board for that tournament). Do not remove it on the rulebook's word.
- **All data stays local**, as in v2. The update and notice checks only *read* public
  files; there are no accounts and no telemetry.

## 2. Architecture

```
┌──────────────────────────────┐        HTTP + Socket.IO        ┌──────────────────────────┐
│ desktop/  RovOverlayTool.exe │ ─────────────────────────────▶ │ backend/  node server.js │
│ WPF, .NET 10                 │   127.0.0.1:3000               │ Express, Socket.IO       │
│ operator screens             │ ◀── stateUpdate, dataChanged ── │ node:sqlite, state.json  │
└──────────────┬───────────────┘                                └────────────┬─────────────┘
               │ starts, owns, stops (stdin pipe + job object)               │ serves
               └─────────────────────────────────────────────────────────────┤
                                                        OBS browser sources ◀┘  /overlay, /result, ...
```

**Why the Node backend stays.** The overlays speak Socket.IO, and they must not change,
so the server has to speak it too; SignalR cannot. The backend also carries all the
tournament logic, the one `sanitizeState` both sides trust, and 349 tests. Rewriting it
in C# would be months of work for no user-visible gain. The desktop app is purely a
client of the same API the HTML pages use.

**Process model** (`desktop/.../Services/BackendHost.cs`):

1. Probe `GET /api/app-info`. If a **v3** backend answers, attach to it (this is how
   `npm run dev` works during development). Settings shows "attached".
2. If anything else holds the port (almost always v2), **refuse** with a clear message.
   `/api/app-info` exists only in v3, which is what makes the check trustworthy.
3. Otherwise start `node server.js` with `ROV_USER_DATA_DIR`, `ROV_USER_MEDIA_DIR`,
   `PORT`, `HOST=127.0.0.1` and `ROV_EXIT_WITH_PARENT=1`, and wait for `/api/app-info`.
4. **Stopping:** close the child's stdin. `backend/server/lifecycle.ts` flushes the
   debounced `state.json` write, closes SQLite and exits (tested in
   `tests/lifecycle.test.ts`). Kill only if it has not gone after 3 s.
5. **Crash safety:** the child is in a Windows job object with `KILL_ON_JOB_CLOSE`, so
   it can never outlive the app and squat on port 3000.

**Where node comes from:** `backend/runtime/node.exe` if present (the packaged app),
otherwise `node` on PATH (development). Node must be 22.5+ for `node:sqlite`.

**Data:** `%APPDATA%\RovOverlayTool3\` holds `data\` (tournament.db, state.json),
`media\` (logos, skins) and `settings.json` (language, port). It is separate from
v2's `%APPDATA%\ROV Overlay Tool\`, which v3 never reads on its own, and from the
install folder, which the updater replaces wholesale.

**Port:** 3000 by default, so existing OBS scenes keep working. v2 and v3 cannot run
at the same time on it.

## 3. Desktop app conventions

- **MVVM without a toolkit.** `Core/ObservableObject`, `RelayCommand`,
  `AsyncRelayCommand` (no double-fire; failures become an error toast). Kept dependency
  free so the project builds offline from the .NET SDK alone.
- **Adding a native screen:** a view model in `ViewModels/`, a `UserControl` in
  `Views/`, one `DataTemplate` line in `App.xaml`, then swap the `Legacy(...)` entry in
  `ShellViewModel` for the new view model.
- **Page view models are created once and kept** (`NavItem.Page`), so switching screens
  keeps unsaved input.
- **Live data:** `AppServices` raises `StateUpdated` (the overlay state),
  `DataChanged` (topics `teams`, `tournaments`, `roster`, `matches`, `games`, `live`)
  and `ConnectionChanged`, all on the UI thread. Screens re-read on the topics they show,
  exactly as the v2 pages did.
- **Text:** `Services/Loc.cs`. XAML `{svc:T Key}`, code `Loc.T` / `Loc.F`. Thai is the
  default. Reuse v2's Thai wording (`backend/public/js/lib/i18n.js`) when the same text
  existed there.
- **Theme:** `Theme/Theme.xaml` is the only place colours are defined. Green appears
  only on the connection light.
- **Motion is short, and there is very little of it.** Hover fades in over 90ms and out
  over 140ms; a screen fades up over 140ms as it arrives; a toast slides in from the edge
  it lives on; dialogs fade and scale from 0.97. That is the whole budget. This is a panel
  someone stares at for an entire event, and anything that moves while they are reading it
  is a defect. The single repeating animation is the draft clock pulsing under ten
  seconds, and that one exists to be caught by peripheral vision rather than to look nice.
  Animate `Opacity` or a transform, never the shared brushes: they are frozen resources
  and animating them throws.
- **Icons:** Segoe Fluent Icons (Windows 11) with Segoe MDL2 Assets as fallback. Write
  glyphs as `\uE80F` in C# and `&#xE80F;` in XAML, never as raw characters (§9).
- **Checking a screen without a person:** `RovOverlayTool.exe --page Home --lang en
  --snapshot out.png` renders the window to a PNG and exits. The snapshot run uses its
  own single-instance name, so it works beside an open app.

## 4. Screen migration

| v2 page | v3 now | Target |
|---|---|---|
| `/` Home: tournament list, create | **Native** | done (M1) |
| `/` Home: backup and restore | **Native**, in Settings | done (M2) |
| `/tournament/:id` | **Native** (details, roster with inline team editor, add/create team, match summary, standings and playoff draw, per-tournament OBS URLs) | done (M2) |
| `/teams` | **Native** (search, create with players and logo, multi-select bulk delete, W-L and tournament counts) | done (M2) |
| `/teams/:id` | **Native** (roster and logo editor, tournaments, match history) | done (M2) |
| `/control` Control Panel | **Native** (match info, on-air switches, draft timer with the 16-phase sequence and round stepper, both sides with rosters, lanes, picks, bans, logos, registry load, sound levels, undo/switch/reset, keyboard shortcuts) | done (M3) |
| `/tournament/:id/bracket` | **Native** (bracket drawn on a canvas with connectors, draw/redraw/clear, random draw, score boxes, put a match on air) | done (M4) |
| `/analytics` | **Native** (presence/pick/ban/win/ban-priority table, tournament and team scope, hero search, the draft in progress shown apart) | done (M4) |
| `/tournament/:id/drafts` | **Native** (every recorded draft as portraits, team and hero filters) | done (M4) |
| `/design` | **Native** (theme colours and sizes, six background-image slots with upload/clear and previews, the two skin switches) | done (M5) |
| `/hotkeys` | **Native**, including system-wide hotkeys through Win32 `RegisterHotKey` | done (M5) |
| `/guide` | **Native**, rendered from `backend/docs/USER_GUIDE.md` in the app language, with a search box | done (M5) |
| OBS URL list | **Native** (title bar) | done (M1) |
| Settings | **Native** | done (M1) |

**Electron-only v2 features that need a v3 answer:**

- Global hotkeys: **done in M5** through Win32 `RegisterHotKey` in `Services/GlobalHotkeyHost.cs`.
- The first-run licence agreement dialog: M7, with the installer.
- The app menu that opened overlay windows so sound effects play: see §8.

## 5. Updates and notifications (built in M7)

**Updates: Velopack 1.2.0**, the only third-party package in the app.

- `scripts/pack.ps1` stages a self-contained `dotnet publish`, the backend with a clean
  production `npm ci`, and `node.exe` into `backend/runtime/`, then runs `vpk pack`.
  Staged bundle 255 MB; installer 124 MB, plus a portable zip and a full `.nupkg`.
- It strips `public/images/team-logos` and `skins` from the stage first. Those are
  whatever the person building happened to upload, and v2 once shipped them to everyone.
- Feed: **GitHub Releases on `LazyAF-zZzZ/rov_overlay_v3`**, public because a private
  feed would need every user to hold a token. `pack.ps1 -Publish` uploads; without that
  switch nothing reaches anyone.
- Checked on start and every six hours, downloaded in the background. The operator is
  told it is ready and **nothing is installed until they press "Update now"** (the popup,
  or the version number in the title bar). Until 3.0.8 it also went in by itself when the
  app closed; **the user asked for that to be removed on 2026-09-15**. Two switches carry
  it: `ApplyOnExit` is gone, and `VelopackApp.Build().SetAutoApplyOnStartup(false)` in
  `Program.cs`, because Velopack otherwise applies a downloaded update on the next start by
  default - removing only the on-close install would have moved it to startup.
  Copies at 3.0.8 or older still install on close, including when the release that removes
  it reaches them.
- Channels `stable` and `beta`, chosen in Settings and read fresh on every check.
- Only an installed copy can update. A portable copy, or a build from the repo, says so
  in Settings instead of pretending to check.

**Notifications: a notice feed**, with no server of ours.

- `notices.json` in the repository root, read over HTTPS on start and every six hours:
  `{ id, level: info|warning|critical, title: {th, en}, body: {th, en}, url?,
  minVersion?, maxVersion?, expires? }`.
- A bell with a count in the title bar, a panel to read them, and a toast for new ones.
  Dismissed ids are kept in `settings.json`, so a notice does not come back.
- The version filtering happens on the operator's machine, so **nothing about them is
  sent**: the app only GETs one public file. Offline, nothing is shown and nothing warns.

## 6. Layout

```
backend/            v2's server, overlays and tests, adapted for v3 (see §9 for what changed)
  server/http/api-app-info.ts   v3 identity route
  server/lifecycle.ts           stdin-driven clean shutdown
desktop/
  RovOverlay.slnx
  RovOverlay.Desktop/
    Core/           ObservableObject, commands, converters, helpers
    Services/       BackendHost, ApiClient, SocketIoClient, AppServices, Loc, Toasts, settings
    Models/         API reply records
    ViewModels/     Shell, Home, pages
    Views/          MainWindow, HomeView, SettingsView, LegacyPageView
    Theme/Theme.xaml
docs/PLAN.md        this file
docs/v2/            v2's plan, guide and notes, for reference
```

## 7. Milestones

| # | What | State |
|---|---|---|
| M1 | Copy backend; WPF shell; backend host; Socket.IO client; Home; Settings; OBS list | done, `e826fb3` |
| M2 | Native tournament detail, team registry and team profile; backup/restore in Settings | done, commit after `e826fb3` |
| M3 | Native Control Panel (draft, picks/bans, timer, scores, live match) | done, commit after `6f736b3` |
| M4 | Bracket, analytics, tournament drafts | done, commit after `ab3bdf8` |
| M5 | Design, Hotkeys with native global hotkeys, Guide | done, commit after `c3ac12a` |
| M6 | Import from v2: read its database and images, merge them in, never write to its folder | done, commit after `3fcb2a9` |
| M7 | Packaging: bundled node, Velopack installer, updates, notice feed, licence dialog | done, commit after `c615d39` |
| M8 | Release 3.0.0 | done. 3.0.0 could not open a window; **3.0.5** was the first published release and **3.0.6** the first that reached anyone by updating itself |
| S1 | Supporter key check in the backend (Ed25519, offline) + API + tests (§10) | **done 2026-09-27**, commit after `b493e35`. `domain/supporter.ts`, `store/supporter.ts`, `http/api-supporter.ts`, `tests/supporter.test.ts` (18 tests; 420 in all) |
| S2 | Watermark on every overlay via `overlay-size.js`, hidden for supporters (§10) | **done 2026-09-27**, commit after `2a1fa96`. In `overlay-size.js`, starts hidden; `data-watermark` per page (result: `bottom-left`); draft overlays: inside the banner; the app shield sits before the text as one mark (2026-09-28). Placement checked in a browser; **look in OBS not yet confirmed by the user** |
| S3 | Settings: Supporter section, expiry reminder, Garena/Tencent disclaimer (§10). S1-S3 ship **together** | **done 2026-09-28**, commit after `7bec2f0`. Settings section, reminder toast, disclaimer. Clicked through for real with `scripts/uia.ps1` (new `set-text` action) against a throwaway backend |
| S4 | Key generator on the maker's PC (secret key outside the repo); sales by hand (§10) | **tool done**; manual PromptPay dropped for the key shop (S5) |
| S5 | **Key shop**: Stripe (PromptPay + card) behind a Cloudflare Worker in `cloud/`; the app's Support → Get a key opens it (§10) | **built and tested locally 2026-09-28** (11 tests, fake Stripe); **not deployed**: waits for the user's Stripe and Cloudflare accounts |

## 8. Open items


- **The installed copy was installed from the agent session, so it lives in a sandbox.**
  Its desktop shortcut points into `Packages\Claude_*\LocalCache` and shows no icon. It
  needs uninstalling from Windows Settings and reinstalling by double-clicking the Setup
  file in Explorer, which is the only way to get real paths, working shortcuts and a
  correct icon. Check the tournaments survived afterwards; if not, the data is under
  `Packages\Claude_*\LocalCache\Roaming\RovOverlayTool3` and copies straight across.
- **3.0.5 is published.** Released 2026-09-12 as `v3.0.5` on
  `LazyAF-zZzZ/rov_overlay_v3`, public, five assets, with `releases.win.json` offering
  3.0.5 Full. That is the first thing anyone outside this machine can install.
- **An update has now gone from one version to the next on its own.** The installed 3.0.4
  found 3.0.5 in the feed, downloaded it into `packages/`, and `current/` became 3.0.5
  without anyone running Setup. What is *not* verified is the operator's view of it: the
  updated app restarts outside the agent session's sandbox, so its API stops being
  reachable from here and the window is the only thing left to read.
- **3.0.7 was published twice, replacing itself.** The first `v3.0.7` (the grey filter
  alone) was deleted with `gh release delete v3.0.7 --cleanup-tag` and packed again from
  `d1c607f`, which added the guide's v2-import section and the `candidatePaths()` fix.
  Two things this depends on: the local `releases/` 3.0.7 nupkgs must be deleted first or
  the delta is built against 3.0.7 rather than 3.0.6, and **anyone who already downloaded
  the first 3.0.7 never receives the second** — same version number, so the updater has
  nothing to offer them. One `-full.nupkg` download had already happened. Replacing a
  version in place is only safe in the first minutes after publishing, before a notice
  goes out; otherwise cut the next number.
- **3.0.7 shipped without the smoke test, because the operator's own app was running.**
  `scripts\smoke.ps1` refuses to start a second copy (the single-instance mutex would
  make it show "already open" and exit, which is not what it tests), and closing the
  user's live app to satisfy it was not something to do unasked. 3.0.7 changes only
  `overlay.css`, `overlay.js`, the guide and the version number — no C# at all — and
  3.0.6 was the build running on screen at the time. **That reasoning does not
  generalise**: any release that touches `desktop/` must wait for the app to be closed
  and be smoke-tested for real.
- **Third place exists only for single elimination.** The knockout stage drawn after a
  group stage is the same shape with the same need; `addThirdPlace()` drops straight into
  that path when someone asks for it.
- **A notice has been delivered; dismissing one has not been checked.** A test entry was
  pushed to `notices.json` on 2026-09-12 and reached the installed 3.0.4 on its next
  start: the bell showed a count of one, photographed from the running app. What is still
  untried is pressing "Got it" and confirming it stays gone after a restart, which is the
  half that writes to `settings.json`.
- **Anything in its own window cannot be checked by a render.** `--snapshot` draws the
  main window's content with `RenderTargetBitmap`, and a `Popup` or a modal `Window` is a
  separate HWND it never sees. So the notice panel, the OBS source list, the confirm box
  and the **first-run licence dialog** are verified by their markup, their strings and
  their data, never by a screenshot. The licence dialog is the first thing a new user
  meets, so look at it by hand at least once.
- **No v2 data exists on this machine to import.** `%APPDATA%\ROV Overlay Tool` does not
  exist and the database in the v2 repo has zero rows, so the importer was proved
  against a synthetic v2 install instead. Run it once against a real one.
- **Click through M2 and M3.** Create a tournament and a team, edit a roster
  inline, upload and clear a logo, remove a team, delete a tournament, save a backup and
  restore it; then run a real draft: type heroes, Enter to confirm, the timer, the
  shortcuts, swap, undo. Rendering is verified; these flows are not. **There is UI
  automation now**: `scripts/uia.ps1` presses buttons by their text, reads fields back and
  captures windows and dialogs, against a snapshot build left open with a long
  `--snapshot-delay` beside a throwaway backend. It has only been pointed at the game-over
  flow so far, and on its first run it found a real bug there (the match title field
  frozen after Put on air). The flows above are the next thing to point it at.
- **The Control Panel's shortcuts only work while the app has focus.** System-wide
  hotkeys (Win32 `RegisterHotKey`) cover the draft, and since the score-keys work also +1 / -1
  and the rounds, and since 3.1.0 they are on by default under the name "Hotkeys".
- **Sound effects still need an overlay page open to be heard on air** (§8, unchanged by
  M3). The Control Panel's TEST button plays locally only.
- **Standings ignore the "teams through" box until it is a valid 1-8**; an invalid value
  keeps the last good one. Fine, but it shows no error.
- **Sound effects.** In v2 the Electron menu opened the overlay in a window so its
  `?sfx=1` audio played. v3 has no such window. Decide in M3: an OBS browser source
  with "Control audio via OBS", or a hidden WebView2 player.
- **Code signing.** An unsigned installer gets a SmartScreen warning.
- **`CONTROL_TOKEN`** is not used by v3 (the server binds 127.0.0.1 only). Revisit if
  the server is ever exposed on the LAN.
- **Logo size hint visible again** (user noticed it was gone, 2026-09-28). v2 showed it under the
  logo buttons; the native Control screen had it only as a tooltip on the logo box. Now a muted
  line under Upload / Clear logo (`Control.LogoSize`: square, 184 × 184 px or larger), and the
  team profile's `Team.LogoHint` gives the size too. 184 is the largest any overlay draws a logo
  (the draft overlay at 1440p; the team card is ~170 at 1440p, the rest smaller).
- **Release 3.2.0, ready but not published (2026-09-28).** Version bumped in
  `backend/package.json` (+ lock) and the csproj; notes in `docs/release-notes/3.2.0.md`;
  README rewritten for the public (download, the supporter key table, Stripe, a 7-day refund
  policy, licence, disclaimer, developer notes). **The README's contact line is a placeholder**
  until the user gives an email or LINE ID. `pack.ps1 -Version 3.2.0` built it (stable channel)
  and `smoke.ps1 -FreshLicence` opened a window titled "Nuzka"; the exe says product Nuzka,
  3.2.0. **That local 3.2.0 pack is now stale** (the watermark changed after it): delete
  `releases/RovOverlayTool3-3.2.0-*` and the 3.2.0 entries vpk wrote, then re-pack, before
  publishing. Shortcuts: Velopack updates them when `--packTitle` changes (velopack#67, fixed
  by PR #165, July 2024; our vpk is newer), so existing "ROV Overlay Tool" shortcuts should
  become "Nuzka"; confirm on the first real update. To publish: the contact, the user's OK,
  push, a heads-up in `notices.json`, then `pack.ps1 -Version 3.2.0 -Publish` with
  `GITHUB_TOKEN` from `gh auth token`.

- **Automatic backups (2026-09-28, after the user lost a whole tournament that day).**
  `server/services/auto-backup.ts`: a backup in the Save-a-backup format (logos included) in
  `<data>/backups/auto-YYYYMMDD-HHMMSS.json` (UTC) 60 s after any `notifyData` change
  (`sync.onDataChange`, new), every 15 min, on clean shutdown (`lifecycle.shutdown`), and before
  any restore. Never written when identical to the newest (sha256 fingerprint in
  `backups/index.json`, rebuilt from the files if lost) or when there are no teams and no
  tournaments, so an empty moment can never evict good backups. Newest 30 kept. Every backup ends
  with `PRAGMA wal_checkpoint(TRUNCATE)`, so the main file is complete: the loss happened because
  the main file had not been written since 07:31 and the data lived only in the WAL. No backup
  creates a database that does not exist yet. API: `GET /api/backup/auto` (list, no
  fingerprints), `POST /api/backup/auto/:name/restore` (name must match the pattern; merge only,
  never deletes). Settings lists the newest five with Restore, and Open backups folder. Tests:
  `tests/auto-backup.test.ts` (10). Checked end to end on a throwaway server: seeded 32 teams, a
  backup appeared a minute later with the WAL at 0 bytes, everything was deleted, no empty backup
  followed, and Restore brought back 32 teams, the tournament and 112 matches.
- **`--port <n>` for the desktop app**: attach-only (`BackendHost(port, attachOnly: true)`), never
  starts a backend and is never saved. Every test of the app goes through it now (CLAUDE.md).
- **Overlay layout editor (2026-09-28, 3.2.0-beta.17).** The user asked for every part of the
  overlay to be draggable anywhere; they chose the draft overlay first, editing in the browser,
  and groups plus single items. `state.layout[scene][part] = { x, y, s, h }`
  (`server/domain/layout.ts`, in `CARRIED_OVER_KEYS`), offsets in 1080p pixels (1440p is the
  same layout scaled 4/3, so one layout serves both). Only moved parts are stored; names are
  slugs because they go into a CSS selector. Socket `updateLayout {scene,key,value}` and
  `resetLayout {scene}` (control events). `public/js/overlay-layout.js` applies it on every
  page with `<body data-layout-scene>`, via the CSS `translate`/`scale` properties so the
  page's own transforms and animations still work (needs Chromium 104: OBS 31 or newer).
  `?edit=1` turns the page into the editor: the page fitted left of a side panel, click selects
  the smallest part (own hit test, since parts may have `pointer-events: none`), Select group /
  Alt+click for the group around it, drag, arrows (Shift 10 px), X/Y/Size fields, hide (ghosted
  while editing), per-part reset, reset all, Ctrl+Z, and a snap back to the original spot within
  6 px. Every move is sent at once (throttled to 80 ms while dragging), so OBS follows live.
  Design screen: a Layout card with the count of moved parts, **Edit layout** (opens
  `/overlay?edit=1&lang=..`, or `-1440`) and **Reset layout** with a confirm. The draft
  overlay has 36 parts: banner; blue/red bans, BAN labels, each ban; centre, tournament, score
  row, each team (logo, name), score numbers, timer, match title; blue/red picks and each pick.
- **Layout on every overlay (3.2.0-beta.18).** All ten broadcast pages now have a scene: draft
  (both sizes), result, prev, standings, matchup, team-drafts, team-card (one layout for both
  sides), teams, analytics. A test derived from `PAGES` makes every broadcast page name a
  scene and load `overlay-layout.js` last. Boards build their contents in script, so a
  container marked `data-layout-items="team"` gets its children named `team-1`, `team-2`, ...
  by position (or a list, `"blue-column red-column"`), re-done by a MutationObserver before
  paint whenever the board rebuilds. The Design card has a dropdown of the nine layouts, each
  with its count of moved parts; Reset works on the chosen one. The watermark re-picks its
  corner on a `rov-layout` event, since a move changes no content.

- **Team list grid (beta.25, user's request):** the grid comes from the per-set setting, not
  the cards in the set: up to 16 per set is 2 columns, then one column per 8 (24 = 3 x 8,
  32 = 4 x 8, up to 6), at least 4 rows (8 = 2 x 4, 16 = 2 x 8). Rows are `1fr` of the height
  left, and `sizeCards()` measures a card at `--k: 1` and scales everything in it by
  `--k = rowHeight / natural` (0.5..2.4, stepped down while any card overflows), so the grid
  ends exactly at the bottom margin. Sets now fill to the setting (40 at 16 = 16 + 16 + 8)
  instead of splitting evenly, so every set has the same grid and card size. Roster shows
  when there are 6 rows or fewer. `.dense` is gone. Re-measured after `document.fonts.ready`.
- **Team list in looping sets (3.2.0-beta.19, user's request).** `/overlay-teams` shows at most
  32 teams at a time (`?perSet=4..64`), split evenly (40 = 20 + 20, so every set has the same
  card size), each held 12 s (`?seconds=3..120`) after its last card is in, then the cards
  fade out together and the next set fades in together (the user asked for a fade, not the
  first slide version). **Entrances:** tried fading in (beta.20-23), then the user asked for the
  original one-by-one slide-in back, for the first set and every new set, with only the exit
  fading (beta.24); it loops. The subtitle ends in
  `· 1 / 2`. `?set=n` shows one set without looping, and `?edit=1` holds the first set so
  cards do not change under the mouse. Timers only, no `animationend`, for the same OBS reason
  as `settleSoon`. The heading gets `.settled` after its first entrance so a new set does not
  replay it. Layout parts `team-N` are positions within the set.
  **Teams per set in the app (beta.22):** Design > Team list has a − [n] + box (4..64) bound to
  `state.teamListPerSet` (carried over, socket `updateTeamListPerSet`, default 32). The overlay
  waits up to 1.5 s for the first state so it does not draw 32 and then re-split, and re-splits
  live when the value changes. A `?perSet=` in the URL still wins. The box is read on Enter or
  on losing focus, not per key, and the state echo does not overwrite it while it has focus.
  **List style (2026-09-29):** Design > Team list also has Sets / Scrolling radio buttons bound
  to `state.teamListStyle` and a speed box (10..200 px/s) bound to `state.teamListScrollSpeed`,
  both carried over, sockets `updateTeamListStyle` / `updateTeamListScrollSpeed`, defaults
  `sets` and 40. An unreadable style falls back to `sets`, so a state file written before this
  existed looks exactly as it did. Scrolling lays every team out in one list at the same row
  height as Sets — `teamListPerSet` becomes "how many fill one screen", so the card size does
  not change between styles — draws the list twice inside `.tl-viewport > .tl-track`, and
  translates it up by exactly one run plus the gap, so the second copy lands where the first
  began and the loop has no seam. Only the first screenful gets the one-by-one entrance; the
  rest start visible, because a card that begins at `opacity: 0` may never appear while OBS has
  the source stopped. `fitToStage()` is skipped (this list is meant to overrun the screen), and
  `?edit=1` falls back to Sets so the layout editor still drags a still grid. `?style=` and
  `?scrollSpeed=` in the URL win over the app. The speed box is greyed out under Sets rather
  than hidden.
  **Card colour (2026-09-29):** the card's left stripe and its tag chip both read
  `state.theme.teamCard`, default `#3b82f6` — the value that used to be hard-coded in
  `overlay-teams.css`, so a theme nobody has touched draws exactly the card it drew before.
  It shows as "Team card" in Design > Colours and sizes. It is a real theme colour, so it lives
  in all three default files that `tests/theme-defaults.test.ts` keeps in step
  (`THEME_DEFAULTS`, `:root` in `overlay.css`, `THEME_DEFAULTS` in `design.js`) and carries over
  with the rest of the theme, even though the draft overlay never draws with it — that test
  requires every theme key to own a `--ov-*` token, and a key wired to only one page would fail
  it. `overlay-teams.js` derives two more variables from it: `--ov-team-card-rgb` for the tag's
  `rgba()` fills and `--ov-team-card-soft`, mixed toward white in JS for the tag text, because
  `color-mix()` is too new for the CEF in older OBS builds and an unsupported function would
  drop the whole declaration.
  **Card background (2026-09-29):** `state.theme.teamCardBg`, default `#111220`, shown as
  "Team card background". One colour drives both stops of the gradient: the second is mixed
  3.2% toward white in `applyCardColour()`, which reproduces the old hard-coded
  `rgba(17,18,32,.94) -> rgba(24,25,41,.86)` to within a couple of levels per channel. **The two
  alpha values stay in the stylesheet and are deliberately not settable**, so whatever colour is
  picked, the footage behind the overlay still shows through the card; a test asserts they are
  still there. The names on the card are white and their colour is not tied to this one, so a
  light background reads at about 1.39:1 and is unreadable (measured).
  **Dark text on a light card (2026-09-29):** `state.teamListAutoText`, default **on**, the
  "Dark text on a light card" tick under the card colours; `?autoText=off` in the URL forces
  white. It compares the real contrast of dark ink and white ink against the chosen background
  and takes the better one, rather than cutting at one lightness value — yellows and limes are
  brighter than they look. On by default is safe because the default background is dark, so it
  changes nothing until someone picks a pale colour: measured 1.39:1 before, 15.53:1 after, and
  1.22:1 with the tick cleared. Everything drawn on the card hangs off one `--ov-team-card-ink-rgb`
  (names, roster, borders, the logo well, and the tag text, which mixes toward black instead of
  white), plus `--ov-team-card-captain`, because flipping only the team name would leave the
  roster unreadable beneath it. A test forbids a hard-coded white anywhere in the card blocks.
  **Where the controls live (2026-09-29):** the two card colours and this tick sit in Design >
  Team list, not in Colours and sizes, which is now the draft overlay's theme alone. They are
  still ordinary theme colours underneath — `DesignViewModel` keeps them in `TeamListColors`
  beside `Colors`, and anything that walks every colour must use `AllColors` or the new ones
  will not take a state update or a language change. The colour row template moved to
  `DesignView.xaml`'s resources as `ColourRow` so both sections draw the same control.
  **Card corner radius (2026-09-29):** `state.theme.teamCardRadius`, a theme *number* (0-40,
  default 12, 0 gives square corners), so it lives in the same three default files and follows
  the same `--ov-*` token rule as every other theme number. It is still multiplied by `--k`, or
  a table that shrank to fit would keep full-size corners on half-size cards. The slider sits in
  Design > Team list beside the card colours, which is why `DesignViewModel` also splits
  `TeamListNumbers` off `Numbers` — anything walking every number must use `AllNumbers`. The
  number row template is the shared `NumberRow` resource, the same trick as `ColourRow`.
  **Columns (2026-09-29):** `state.teamListColumns`, 0 = work it out from the team count (what
  it always did), 1-6 = fixed; `?columns=` in the URL still wins. Picking 1 gives one tall
  column. Note the interaction with the roster: player names only draw while `rows <= 6`, and in
  one column `rows` equals teams-per-set, so a single column shows rosters only at 6 or fewer per
  set. At 8 the cards are 86px tall and the names are dropped on purpose (verified 2026-09-29).

### Fonts on the broadcast graphics (2026-09-29)

`state.fonts` = `{ all: {role: family}, pages: {scene: {role: family}} }`, carried over with the
rest of the tool settings. Four roles — `heading`, `name`, `number`, `body` — chosen in Design >
Fonts, which sits above Team list because it reaches every graphic. "Applies to" picks **All
pages** or one scene; the scene keys are the `data-layout-scene` values the layout editor already
uses, so `/overlay` and `/overlay-1440` are both `draft` and are set together. A test fails if a
broadcast page has a scene the app offers no way to pick.

- **Setting a role for All pages also clears that role from every page override.** Otherwise the
  operator picks "all pages", a page they once customised does not move, and the app looks
  broken. Choosing "all" means *make them the same*, not *set a value that stays overridden*.
- **Kanit stays at the end of every stack** (`"Chosen", 'Kanit', 'Segoe UI', Arial, sans-serif`).
  The list offers fonts installed on the operator's machine, and nearly all of them are Latin
  only. Without Kanit behind them a Thai team name drops to Arial mid-broadcast, which is exactly
  what `fonts.css` warns about. With it, the browser falls back per character: Latin in the
  chosen face, Thai in Kanit. The app marks a font "(no Thai)" by opening its glyph table and
  asking for U+0E01, so the operator knows the page will show two faces before they pick.
- **Font names are sanitised on the server** (`sanitizeFontFamily`: letters, digits, spaces,
  hyphens, underscores, 64 chars). The name is written into a custom property on a live graphic,
  so a name carrying `;` or `}` could inject CSS into something on air; backups from another
  machine come through the same door. The app leaves out families the sanitiser would rewrite,
  including the `@`-prefixed vertical duplicates Windows lists, rather than offering a font that
  then arrives as something else. Verified with `Arial; } body { display: none`, which stores as
  `Arial body display none` and leaves the page rendering.
- `overlay-fonts.js` is loaded by all ten broadcast pages, like `overlay-size.js`, and sets the
  four `--ov-font-*` properties. It applies the plain Kanit chain immediately at load, before the
  socket connects, so a page that cannot reach the server still has fonts and nothing jumps face
  mid-air. Each stylesheet hands its `body` to `--ov-font-body` and tags its headings, names and
  numbers; a test fails if a broadcast stylesheet never reads the body role.

**Imported fonts (2026-09-29, 3.2.0-beta.34).** The user asked to import font files and use
them in any text role. Design > Fonts has an "Imported fonts" library (Import font…, Delete)
above the role boxes, and every role box lists Default, then imported fonts, then installed ones.
- Files live in `<media>/fonts` with server-made names `f<10 chars>.<ext>` and a `fonts.json`
  index (name, size, date, Thai), rebuilt from the files if lost (`store/font-files.ts`). The
  type comes from the first bytes (`00010000`/`true` TTF, `OTTO` OTF, `wOFF`, `wOF2`); `ttcf`
  collections are refused; 20 MB and 100 fonts at most. API: `GET /api/fonts`,
  `POST /api/fonts?name=&thai=` (raw body), `DELETE /api/fonts/:id`, and `GET /user-fonts/:id`
  serving the file by id with its font MIME type and `nosniff`.
- **No second role system:** an imported font's family is `nzf-<id>`, which passes
  `sanitizeFontFamily` unchanged, so it is stored in `state.fonts` like an installed family.
  `overlay-fonts.js` sees the `nzf-` pattern and declares an `@font-face` pointing at
  `/user-fonts/<id>` once per font; Kanit still follows it in the stack, so Thai falls back.
  When the file has loaded it fires `rov-fonts`, and the team list, stats board, previous games,
  standings and the watermark re-measure.
- Deleting a font clears it from `all` and every page override (`dropFontFamily`) and emits.
- The app reads the family and face name and whether U+0E01 exists from the file itself (WPF
  `GlyphTypeface`, TTF/OTF only); WOFF/WOFF2 keep the file name and an unknown Thai flag.
- On a single page, a blank role box says "Default" although the page follows All pages, which
  looked broken once an imported font was set for all: each role now shows "All pages: <name>"
  underneath when it inherits.
- **In backups (beta.35):** `data.fonts` = `[{id, name, thai, bytes}]` (optional, so older files still
  read; no version bump) plus `data.fontsLeftOut`. `readFont` applies the upload rules (server-made
  id, font magic bytes, 20 MB); a restore writes each under its **same id**, so a role still set to
  `nzf-<id>` finds it again, and never overwrites a font already there. Fonts in one backup are
  capped at 24 MB raw (`MAX_FONT_BYTES_IN_FILE`, ~32 MB as base64) so the file stays under the
  64 MB a restore accepts; the rest are counted in `fontsLeftOut` and the restore dialog says so.
  Import and delete call `notifyData({ topic: 'fonts' })`, so the automatic backup follows a
  minute later; restores emit it too so the Design library refreshes. Checked end to end: import,
  automatic backup (276 KB with a 202 KB font), delete, restore that backup, font back and served.

### The Design screen is organised by page (2026-09-29)

One "Design for" picker at the top drives the whole screen: the layout editor's scene, the
fonts scope, and which sections appear. There used to be two page pickers on this screen (the
layout scene and the fonts "applies to") which could point at different pages at the same time.
The selected page is remembered in `settings.json` (`DesignPage`), since an operator mostly
styles the same graphic over and over.

What each page shows, taken from what the stylesheets actually read, not from guesswork:

- **All pages (shared)** — fonts for every graphic, plus the five shared colours. No layout,
  because there is no one overlay to edit.
- **Draft overlay** — layout, fonts, shared colours (blue, red, text, label — it never uses
  accent), text sizes and logo size/inset (`--ov-type-*` and `--ov-logo-*` appear only in
  `overlay.css`), and its background image slot.
- **Team list** — layout, fonts, and every team-list setting. No shared colours: it paints
  with its own card colours only.
- **Standings** — layout, fonts, shared colours (accent, text, label — no blue or red).
- **Result** — layout, fonts, and its two background image slots. `result.css` reads no theme
  colour at all.
- **Matchup / Previous games / Team card / Team drafts** — layout, fonts, all five shared
  colours. `team-drafts` has no stylesheet of its own; it loads `overlay-matchup.css`.
- **Analytics** — layout and fonts only.

- **A shared colour is shown on every page that paints with it, and says which others it
  moves** ("Shared: changing these also changes Matchup, Previous games, …"). The list is built
  from `ColourPages` in `DesignViewModel`, which must be kept honest against the stylesheets:
  a colour that silently reaches further than the label claims is worse than no label.
  The tick beside them turns the repetition off, leaving them under All pages only. It is on by
  default and lives in `settings.json`, not in overlay state: it is how this operator likes the
  screen, not something that goes to air.
- **Background images follow `data-skin-slots`**, which only `/overlay` (+1440) and `/result`
  declare, so only those two pages offer them.
- `DesignViewModel` now keeps `Colors`/`TeamListColors` and `Numbers`/`TeamListNumbers` apart so
  each section can show its own. **Anything that walks every colour or number must use
  `AllColors` / `AllNumbers`**, or the split-off rows stop taking state updates and language
  changes. The constructor sets `_designPage` directly, which skips the setter that keeps the
  layout scene and font scope in step, so it syncs them by hand straight after `LayoutScenes`
  exists — and it has to be after, or a remembered page reads a collection that is still null.

### Design moves into the overlay editor; the Design screen is gone (2026-09-30, 3.2.2-beta.9; beta.2 to beta.8 were built but never published)

User's request: "move all design into edit layout and move the edit layout button to OBS sources, next
to each page title". The app's Design screen, its view model and its menu entry are deleted.
- **OBS sources** rows have an **Edit** button beside the name (`ObsSourceRow.EditCommand`), opening
  `<page>?edit=1&lang=..` without `sfx=1` so the editor never plays draft sounds. The name column is
  250px so "Previous picks & bans" fits with its button and the SOUND badge.
- The editor panel (overlay-layout.js, now 360px) has **Layout** and **Style** tabs; `?tab=style` opens
  on Style. `public/js/overlay-style-editor.js` (loaded by every broadcast page before
  overlay-layout.js, inert until `RovStyleEditor.mount`) builds Style from a per-page table taken from
  the old DesignPages: fonts on every page (scope This page / All pages, the four roles, import and
  delete), the colours that page reads, sizes on the draft overlay, background images (1080 and 1440
  slots, the two skin toggles) on draft and result, and the team-list settings on the team list. It
  sends the same socket events the Design screen did. **Trap:** values are captured when the control
  changes, not when its 150 ms debounce fires; a stateUpdate arriving in between wrote the old value
  back into the picker and the old colour was sent.
- **Installed fonts:** a page cannot list Windows fonts, so `Services/SystemFonts.cs` (moved out of the
  view model) PUTs `/api/system-fonts` on every socket connect; the server keeps it in memory. The
  editor reloads its font lists on window focus, in case the app connected after it opened.
- **Importing in the browser:** the server now reads the family/face name (`name` table) and whether
  U+0E01 is mapped (`cmap` formats 4 and 12) from TTF/OTF files itself (`domain/font-info.ts`), as the
  WPF app used to; WOFF/WOFF2 keep the file name. Checked against Tahoma, Leelawadee, Impact, Arial.
- **Text** (added the same day, user's request, Control keeps its boxes too): the first Style section on the
  draft overlay (tournament, title, names, scores, players), result (title, names, scores) and previous picks
  (tournament, names). Same socket events as Control, so the two never disagree; an emptied box is not sent
  and shows the live value again on blur, because the server keeps the old name for an empty one.
- **Team tag on the draft** (user's request, optional): `TeamState.tag` (TAG_MAX 6, empty allowed) comes from the
  registry in goLive and loadTeamIntoSide; `state.draftShowTag` (carried over, off by default) shows it as its own
  badge (`.team-tag`, `data-layout="blue-tag"`/`red-tag`, movable) on the bottom edge of each logo box, hidden when
  off or when the team has no tag. The user asked for it separate: a first version that replaced the name was
  rejected. Tag boxes and the switch are in both the editor Text section and the desktop Control (tag beside the
  team name, switch beside "Swap sides each game"); `updateTeamTag`/`updateDraftShowTag`, an empty tag IS sent. With a tag showing, a no-logo name is bottom-aligned (`data-tagged`)
  so the name-to-tag gap is the same on both sides; centred, a two-line name ended lower than a one-line one.
- **Smart guides** (user's request, "like OBS or Photoshop"): while dragging, a part snaps (7 screen px) its
  left/centre/right and top/middle/bottom to the same lines of the stage and of every other visible part, except
  its own children and the groups around it (a group can grow with its child, so the two would chase each other).
  Targets are collected once at pointerdown. A pink line runs part-to-part, or the full stage for a stage line.
  Ctrl while dragging turns snapping off; the "Snap to guides" box is remembered in localStorage (per viewer). The
  old snap back home within 6 px still applies when no guide is close.
- **Resize handles** (same day): four corner handles on the selection (size is one uniform `s`, so no edge
  handles). The part scales about its transform-origin (read from computed style, usually the centre), so all four
  edges move; size follows the mouse projected onto the origin-to-corner diagonal, and the edge nearest a guide
  is solved back into the exact `s` that lands it on the line. `s` is now stored to 0.001 (was 0.01): at 1% steps
  a snapped edge of a wide part missed its line by several pixels. **Trap:** `drag` must be declared before the
  self-starting `frame()` loop that reads it (TDZ).
- **Page textures** (user's request): an imported picture laid over each page's own background, under its content.
  One image per page in SKIN_SLOTS (`texture<Scene>`, file `texture-<scene>`), so upload, serving and backups come
  free; uploading one must NOT set `skin.enabled` (`isTextureSlot`). `state.textures[scene]` = opacity 0..1, scale
  10..400 % of the image's natural size (x4/3 on 1440p), fit tile|fill, blend (normal/overlay/soft-light/screen/
  multiply); carried over; `updateTexture`. overlay-size.js adds a `.nz-texture` child (absolute, z-index -1, target
  gets `isolation: isolate`) to each target in TEXTURE_TARGETS (draft .pick-section, result .team-section, team list
  .tl-card, standings .st-group, stats .an-row, H2H/team drafts .mu-score/.mu-side/.mu-meetings, team card .tc-logo/
  .tc-tile/.mu-side, prev .pv-round), re-added by a MutationObserver for cards built later. A static target is made
  relative unless one of its absolute descendants is anchored outside it. Hidden where a background image is on.
- Global editor rules (`#layout-editor label` stacks vertically, `input` is full width) are meant for
  the Layout tab's X/Y boxes; Style tick boxes override both.
- Not done: the Design.*, Fonts.*, Layout.* and TeamList.* strings in Loc.M5.cs are now unused.

### Overlay review (2026-09-30, 3.2.2-beta.1)

All nine overlays were rendered at 1920x1080 from a copy of the user's backup (headless Edge; the agent
preview pane cannot screenshot while minimised) and reviewed. The user took every item but one
(darker hero portraits turned out to be a scaled-preview artefact). What changed:
- **Draft:** a team with no logo shows its name in the 138px logo box (`data-nologo`, fitted with
  `RovFitText`); the timer digits hide once all ten picks are in and the clock is stopped (the row
  keeps its space so nothing moves); the match title "A VS B : GAME 5 [BO5]" shows as "GAME 5 · BO5";
  the tournament name is full opacity and weight 600.
- **Result:** series score beside each team and a "GAME 5 · BO5" tag on the centre line. Not a WIN
  mark: this screen is shown after the draft locks and before the game, when nobody has won yet.
  Long names wrap to two lines and shrink to fit instead of "SAIGON PHANT...".
- **Previous picks and bans:** WIN beside the team that won each game. `RoundRecord.winner`
  (relative to that row's own blue/red): tournament games take it from `games.winner` in
  `gameToRound`, flipped when the row is laid out swapped; quick matches set it in
  `finishQuickGame` on the row `stepRound` just filed. Unknown stays null and shows nothing.
- **Head to head:** win rate under each most-picked hero (`MatchupHero.wins/decided`, counted
  where `games.winner = game_slots.side`), and the previous meetings the API already returned but
  never showed (up to three). **Team picks & bans** shows the win rates its API already had. Hero
  tiles 92 -> 128px on both; the team card's seven-tile rows use 104px.
- **Team list:** the tag chip only beside a real logo (the placeholder already shows the tag).
- **Stats board:** portraits 64 -> 76px (46 -> 60 dense); the meta line says
  "presence = picked or banned".
- **Standings:** re-measures after `document.fonts.ready` (the first fit ran with the fallback font
  and 32 teams overran the bottom edge); the tie "=" is drawn in Segoe UI because heavy Kanit at
  that size merged it into a block. Stats board and previous games re-measure on fonts too.
- **Updates reach OBS without a cache refresh:** html/css/js are served `Cache-Control: no-cache`
  and `overlay-size.js` compares `/api/app-info` version on every socket (re)connect with the one
  seen at load; a different version reloads the page once (never in `?edit=1`). Checked by
  restarting a test server as another version: the open overlay reloaded itself.
- `window.RovFitText(el, min)` (overlay-size.js) shrinks text to its box. **Trap:** Kanit's
  ascenders overhang a tight line-height by a few px, so a plain `scrollHeight > clientHeight`
  check shrank every name to the minimum; it allows ~0.3em vertically. Words are not broken
  mid-word (`overflow-wrap: normal`) so a long word shrinks rather than splitting "PHANT/OM".

### 3.2.2 released (2026-09-30)

Everything from the 3.2.2 betas (beta.1 to beta.9, none published): the Design screen moved into each page's
overlay editor (Style tab), text editing and team tags, smart guides with move and resize snapping, page
textures, and the overlay review. Published with `pack.ps1 -Version 3.2.2 -Publish` on the win channel after
pushing; notice `update-3-2-2` targets 3.2.0 and 3.2.1. Same code the user had been running as beta.9.

### 3.2.1 released (2026-09-30)

New hero **Evita** (130 heroes). A hero exists only if `public/images/heroes/<name>.png` exists, so
placeholder cards went in first and the user replaced them with the real 240x390 portrait and 100x100
icon before release; `data/heroes.json` (the fallback list `check-heroes.js` reads) got one line.
Published with `pack.ps1 -Publish`, which now also drops the old-named Setup/Portable copies; the
release keeps the Nuzka installers, both .nupkg files, releases.win.json and RELEASES. Delta from
3.2.0 is 1 MB.
**Local `releases/` trimmed after 3.2.1** (user asked, ~7 GB freed): it now holds only
`RovOverlayTool3-3.2.1-full.nupkg` and a `releases.win.json` listing just that, which is all the next
`pack.ps1` needs to make a delta. Every released version is on GitHub; the betas were never published,
so a new beta channel starts with a full package only. `publish/` is rebuilt by every pack.

### 3.2.0 released (2026-09-30)

Published as **Nuzka 3.2.0** (tag v3.2.0, Latest) at github.com/LazyAF-zZzZ/nuzka, built once and uploaded as
tested: the user installed `Nuzka-win-Setup.exe` from Explorer and opened it before the upload. Delta from
3.1.2 is 2.1 MB. The upload used `vpk upload` + `gh release upload` directly rather than `pack.ps1 -Publish`,
which would have rebuilt. Order: push code, publish, then push the `update-3-2-0` notice (3.0.9-3.1.2,
expires 2026-10-31) so nobody was told about an update before it existed. Checked afterwards: the old
repo address returns v3.2.0 as latest with all 8 assets, and both notice URLs serve the new entry.
Support contact in the README: lazyaf1538@gmail.com.

### Name and repo (2026-09-30)

Every name people read is **Nuzka**: page titles (the OBS source list shows them), the guide, the
README and app messages. What still says ROV Overlay Tool does so on purpose: the "(formerly ROV
Overlay Tool)" line in the README and licence, and every mention of **v2**, which is a real older app
with its own folder (`%APPDATA%ROV Overlay Tool`) and port that the importer and the port-busy message
talk about. "ROV Tournament" (default tournament name) is the game, not the app.

**Unchanged on purpose** (user's choice): the exe `RovOverlayTool.exe`, the Velopack pack id
`RovOverlayTool3` (changing it cuts every installed copy off from updates) and the data folder
`%APPDATA%RovOverlayTool3`. Velopack names the installer after the pack id, so `pack.ps1` also writes
**`Nuzka-<channel>-Setup.exe`** and `-Portable.zip` copies, and `-Publish` attaches them to the release with
`gh release upload` after `vpk upload`; the original names stay for old links. The README points at
`Nuzka-win-Setup.exe`.

**Repo renamed** `rov_overlay_v3` -> **`nuzka`** (github.com/LazyAF-zZzZ/nuzka). The app's update source,
notices feed, revoked-keys list, `pack.ps1` and the README use the new name. Installed copies still
ask the old one: checked after the rename, the web and API addresses answer 301 to the new repo and
the old raw notices URL still serves, so nothing already installed is cut off. **Never create a new
repo called rov_overlay_v3**: that would break those redirects. The local folder is still
`rov_overlay_v3` (tests in import-v2 rely on that basename).

## 9. Traps already paid for

- **A layout group cannot clip its own contents** (2026-09-29). `#grid` on the team list carries
  `data-layout-items`, and `overlay-layout.js` adds `data-layout-overflow` to a group whenever a
  part sits outside it, which has `overflow: visible !important` waiting behind it. The scrolling
  style's list is always outside by design, so the attribute stuck and every card spilled across
  the whole screen while `overflow: hidden` on `#grid` was silently overridden. The clip now sits
  on an inner `.tl-viewport`, which carries no `data-layout-*` and so the editor leaves it alone.
  **Anything that must clip inside a layout group needs its own element to clip on.**

- **The agent preview pane freezes `document.timeline` at 0**, so CSS animations never advance
  there and a scrolling graphic looks stone dead however correct it is. Do not chase it: read
  `el.getAnimations()[0]`, set its `currentTime` by hand and read the computed transform back.
  That proves the keyframes, the distance and the wrap without needing a clock (2026-09-29).

- **A running app serves the overlay files from a bundle fixed at startup** (2026-09-29), so
  editing `backend/public/js/*` changes nothing on screen until it restarts. Two rounds of
  "still overlapping" went into a watermark fix that had been correct on disk the whole time.
  To tell in one step: a brand-new file in `public/js/` comes back 404, and `touch`ing a served
  file leaves its `Last-Modified` alone. **Check a graphic change on a throwaway backend
  (`PORT=3918` with temp data dirs), never against the app the operator is running** — and note
  the installed `current/backend/public` can be an older build than the one being served, so
  comparing against it proves nothing.

- **The team list vanished a second after fading in** (beta.20 to .22, found by the user in OBS).
  `.tl-stage.fading .tl-card { opacity: 0; animation: fade-in forwards }` has the same
  specificity as the `.settled` rule that forces the end state, and comes later, so once
  `.settled` removed the animation the cards fell back to opacity 0. Now
  `.tl-stage.fading:not(.settled) .tl-card:not(.settled)`. My test checked at 150 ms and at the
  set switch, never in between: **check an animated graphic after its settle timer too.**

- **Boards that shrink to fit measure their cards**, so a card the operator dragged down read
  as overflow and shrank the whole board. `fitToStage()` in teams, analytics, prev and
  standings now runs inside `window.RovLayout.asDesigned()`, which takes the moves off for
  the synchronous measurement (transitions off) and puts them back before any paint.
- **A background tab (and possibly OBS with a hidden source) does not run transitions on
  time**, so the 400 ms "is anything outside its clipping box" re-check read stale positions.
  It also runs on `transitionend` of a part's `translate`/`scale`.

- **The draft banner clips its contents** (`overflow: hidden`, to keep its light sweep inside
  the frame), so a part dragged out of it vanished. `overlay-layout.js` sets
  `data-layout-overflow` on a clipping group only while a part is actually outside it, which
  unclips it and hides its `::before`/`::after` sweep (unclipped, it slides past the banner's
  ends). **And the slots have `transition: all`**, so every refresh slid moved parts in from
  their old places: the first layout is applied under `data-layout-settling` (transitions off),
  with a layout read forcing the style while it is set.

- **`"yyyy"` writes the Buddhist year under th-TH.** The app runs with a Thai culture, so
  `DateTime.Now.ToString("yyyy-MM-dd")` gave `2569-09-28`. Anything stored or compared uses
  `CultureInfo.InvariantCulture`; only text shown to people should follow the language (found
  in S3, 2026-09-28). The backup file name in Settings (`rov-overlay-backup-{DateTime.Now:yyyy-MM-dd}`)
  still follows the culture: not fixed, since a Thai year in a Thai user's file name is harmless.
- **Do not run anything in `../rov_pickban_overlay`.** Its `npm start` rebuilds its
  `build/` and opens its `data/tournament.db`.
- **The Browser pane's `preview_start` by name runs v2.** It reads `.claude/launch.json` from the
  workspace root (the parent folder), whose only entry starts `rov_pickban_overlay`, not from
  `rov_overlay_v3/.claude/`. On 2026-09-15 asking for a v3 preview entry started v2 on port 3000
  instead; it was stopped within a minute (v2's `build/` rebuilt from unchanged source, only
  `data/tournament.db-shm` touched, no data written). To look at an overlay, open the URL of a
  server that is already running; never start one by name here.
- **To UI Automation, a window with an Owner is not a top-level window.** The confirm
  dialog (`Owner` = the main window) is listed *underneath* the main window, not among the
  desktop's children. Searching the desktop's children for it finds nothing, which reads
  exactly like "the button never opened a dialog". Look for `ControlType.Window`
  descendants of the main window instead (`scripts/uia.ps1` does).
- **PowerShell variable names ignore case.** A function parameter named `$scope` hid the
  script's `$Scope` (the `TreeScope` type) inside that one function, so
  `$Scope::Descendants` became null there and worked everywhere else.
- **Icon glyphs as raw characters vanish or get mangled.** Perl's and sed's `\u` in a
  replacement means "uppercase the next character", which turned `\uE80F` into `E80F`.
  Write escapes by hand, or rewrite with Node.
- **WPF's implicit usings leave out `System.IO`** (it clashes with `Shapes.Path`), so
  `MemoryStream` and `File` need `using System.IO;`.
- **The TextBox template must not set scrollbar visibility** on `PART_ContentHost`, or
  no TextBox (the log box included) can ever scroll.
- **A closed ComboBox shows the selected item's `ToString()`, not its
  `DisplayMemberPath`**, with our own ComboBox template. The position picker showed
  `RovOverlay.Desktop.ViewModels.PositionChoice`. Every choice type overrides
  `ToString()` to return its label; do the same for any new one.
- **`vpk` builds its feed from whatever is sitting in `releases/`.** A rehearsal build
  left in that folder goes out with the real one, and users are offered a version nobody
  meant to ship. Clear the folder before packing a release, and accept that the first
  release therefore has no delta to build against.
- **Never run the installer from inside the agent session.** That session is sandboxed:
  writes to `%LOCALAPPDATA%` and `%APPDATA%` are redirected into
  `AppData\Local\Packages\Claude_*\LocalCache\`, so Setup records container paths in the
  shortcuts it creates. The desktop shortcut ends up with a target inside the container
  and an icon path outside it, which Explorer draws as a blank page. Worse, the session
  cannot detect any of this: reads fall through, so both paths look identical and equally
  present from in here. Build the installer here; let the user double-click it.
- **Backslashes disappear when a script is written through a shell heredoc.** The command
  text is JSON-encoded before the shell sees it, so `\\` arrives as a single `\`, and
  JavaScript then reads the `\s` and `\p` of `.\scripts\pack.ps1` as plain letters. This
  file twice ended up telling the reader to run `.scriptspack.ps1`. Write anything
  containing Windows paths with the editing tool instead, or build the character with
  `String.fromCharCode(92)` as the glyph fixer does.
- **A window shown before `Application.Run()` pumps messages is never created at all.**
  `OnStartup` is raised inside `Run()` but *before* the message loop starts. The licence
  dialog was asked for there, and being `WindowStyle=None`, `ShowInTaskbar=False` and
  `CenterOwner` with no owner yet, it never materialised: `ShowDialog()` waited for an
  answer from a window that did not exist. 3.0.0 installed, started, and sat as a healthy
  process with no window. Show the main window first and let anything modal own it.
- **A handler that sets `Handled = true` can hide the failure completely.** The startup
  exception path showed a toast, and a toast needs a window. Before the window exists,
  write the failure to `%APPDATA%\RovOverlayTool3\startup-error.log`, show a plain
  `MessageBox` (no `Loc` — it may be what broke) and stop.
- **`--snapshot` proves a screen renders, not that the app starts.** It deliberately skips
  the first-run licence, so the one path every new user takes was the one path never run
  in seven milestones of verification. `scripts/smoke.ps1` launches the built app and
  fails unless a real visible window appears; `-FreshLicence` does it as a new user.
  Run it before any release.
- **`execFileSync` blocks Node's event loop**, so a server in the same script cannot
  answer while a child process runs. A local notice feed served that way looked exactly
  like a broken notice service: the app's request went unanswered until its own 15-second
  timeout. Use `spawn` and await the exit.
- **Velopack has to run before WPF opens anything.** WPF generates its own `Main` from
  App.xaml, so ours lives in `Program.cs` and `<StartupObject>` picks it. `vpk pack`
  checks this really happened: "Verified VelopackApp.Run() in ... Program::Main".
- **A v2 database can be in WAL mode**, and its newest rows live in the `-wal` file.
  Copy the database and its `-wal`/`-shm` aside and open the copy: opening v2's own
  file would replay the log and write to the folder we promised never to touch.
- **A `Style` attribute plus a `<TextBlock.Style>` element on the same control is a
  compile error, not a merge.** Put `BasedOn` inside the inline style instead.
- **`PathFigure` / `PolyLineSegment` do not take bindings** the way a normal element
  does; the bracket connectors are `Polyline`s bound to a `PointCollection`.
- **`BackendHost.BackendDir` must be found even when the app only attaches** to a
  server someone else started, or screens that read files shipped with the backend
  (the Guide) come up empty in development.
- **Setting `DataContext` on an element that also binds through the outer one blanks the
  field silently.** `DataContext="{Binding Player}"` next to `Text="{Binding Player.Name}"`
  resolves as `Player.Player.Name`: no error, just an empty box. Set the DataContext, then
  use plain property names.
- **A second ItemsControl pulled over the first with a negative margin does not line
  up.** Picks were drawn that way at first and simply never appeared. One list whose rows
  carry everything in the row is the fix.
- **Pages opened on top (tournament, team) must unsubscribe** from
  `AppServices.DataChanged` and `Loc.Changed` in `IClosablePage.OnClosed`, or every page
  ever opened keeps reloading itself for the rest of the session.
- **Rows are updated in place by id, never rebuilt**, when a change is pushed from
  elsewhere: rebuilding would throw away an inline editor someone is typing in (the same
  rule as v2's `deferWhileEditing`).
- **`RenderTargetBitmap` renders nothing behind the content**, so the window's root
  border carries the background brush itself, or snapshots come out transparent.
- **The job object kills the backend at once if the app crashes**, before
  `lifecycle.ts` can flush. A normal close is graceful; a crash can lose the last
  150 ms of state. Accepted: the alternative is a server squatting on port 3000.
- **Backend changes from v2:** `package.json` (Electron removed, version 3.0.0-dev),
  `server.js` (lifecycle hook), `server/index.ts` (app-info route),
  `server/store/live-state.ts` (`flushState`), `tests/media.test.ts` (its installer
  guard now reads `scripts/pack.ps1` instead of electron-builder), plus
  the new files named in §6. Everything else is byte-for-byte v2.

---


## 10. Supporter keys (planned 2026-09-27; S1 done the same day)

**Why.** The user wants income from the app without selling it, which the free licence
forbids for others and which would mean selling Garena/Tencent's hero art. The model is
Spectra's (Valorant): the app stays free with every feature; a paid **supporter** plan
removes a watermark from the overlays and adds perks. Supporters pay for the maker's
branding going away, never for game content. A paid "Pro" copy (`../rov_overlay_pro`) and
then a login system (Supabase, Discord/Google) were both considered the same day and
dropped: **the user chose keys only, no accounts and no server.**

**Design.**
- A key carries its own data and an **Ed25519 signature**: key id, supporter name, plan,
  expiry date, e.g. `RVS1-....`. The app holds only the **public** key, so checking is
  **offline**, with nothing of ours online. A broadcast never depends on the internet.
- The **backend** checks keys (Node's built-in `crypto`, no package): signature, then
  expiry. The key is stored in the user data folder; an API saves, reads and removes it;
  `supporter: true/false` reaches the overlays over the existing socket.
- **Watermark** lives in `public/js/overlay-size.js`, which every overlay already loads, so
  all ten get it from one place; a page may move it with a data attribute. Looks can only
  be confirmed by the user in OBS.
- **Settings** gets a Supporter section: key box, "Supporter: <name> until <date>",
  remove, and a button to the maker's page. A reminder 7 days before expiry; after expiry
  the watermark returns and nothing else changes.
- **Key generator** (`make-key --name "Team X" --months 12`) runs on the maker's PC. The
  **secret key never enters this repo**, which is public: it lives in the maker's profile
  folder, with a backup they keep themselves. Lose it and no new keys can be made that
  existing apps accept.
- **Sharing.** Offline keys cannot count PCs, so the "2 PCs" the user wanted is a licence
  term, not something the app enforces. What helps: the supporter's name shows in the app,
  and a **revoked-keys list** (key ids in the public repo, next to `notices.json`) is read
  when online, so a leaked key can be switched off.
- **Payment** starts as PromptPay checked by hand, key sent by the maker. Later a gateway
  (Opn/Omise or Stripe) can issue the same keys automatically; the app does not change.
- **Honest limit:** the source is public, so someone who codes can remove the watermark.
  Spectra has the same limit; supporters pay mostly to support the maker.

**Built in S1 (2026-09-27).**
- Key: `RVS1-<base64url JSON {v,id,n,p,i,e}>.<base64url Ed25519 signature>`, about 215
  characters. The signature covers the prefix too. Whitespace is stripped before checking,
  because keys arrive through LINE and email. `e` is the last valid day, **Bangkok time**
  (`expiresAt` = 23:59:59.999 +07:00).
- `domain/supporter.ts` is pure (`readKey`, `checkKey`, `signKey`) and holds the maker's
  **public** key. Tests swap it with `useVerifyKeyForTests`, **deliberately not an env var**:
  an env override would let anyone self-sign keys without touching the code.
- `store/supporter.ts` keeps `supporter.json` (the key) and `revoked-keys.json` (last
  downloaded list) in the data folder. Only a key that works today is saved; a bad or
  expired paste never replaces a good key. A download that is not a JSON array (offline,
  404, captive portal) leaves the old list in force, so going offline never un-revokes.
- API: `GET /api/supporter` (no token, never returns the key), `PUT` `{ key }` (400 with
  `code`: format / signature / expired / revoked and a readable `error`; renamed from
  `problem` in S3 so `ApiException.Code` picks it up), `DELETE`.
  Socket event **`supporter`** on connect and on every visible change; overlays use it in S2.
- `startSupporterWatch()` runs from `start()` only (tests never reach the network):
  revoked list from `REVOKED_LIST_URL` (`revoked-keys.json` at the repo root) every 6 h,
  expiry re-check every hour.
- **The maker's secret key is at `%USERPROFILE%\.rov-supporter\signing-key.pem`**, made
  with `node backend/tools/supporter-keys.js init`, which refuses to overwrite it. Keys:
  `make --name "Team X" --months 12` (or `--until YYYY-MM-DD`); `read <key>` checks one.
  The tool signs with the compiled `build/` code, so run `npm run build` first. A test
  asserts no private key ever appears in `supporter.ts`.
- `revoked-keys.json` is not on GitHub until the repo is pushed; until then every fetch
  404s, which is harmless.

**Built in S2 (2026-09-27).**
- The watermark is created and styled by `public/js/overlay-size.js`, which all ten
  broadcast graphics load after the script that declares `socket`. Styles are injected
  from there because broadcast pages share no stylesheet. Text **"Powered by Nuzka"** (user, 2026-09-28; before that "Nuzka · by LazyAF", and "ROV Overlay Tool · by
  LazyAF", 23px bold (21px in the draft banner), pure white with a dark shadow, the logo at full strength and 2.8 × the text height (64 px in corners, 59 in the banner, the height of the red ban slots) with a 0.55 em gap (was 15px at 60% in beta.1, then 19/17px at 85%; the user asked twice for bigger and brighter), `pointer-events: none`, scaled 4/3 at 1440.
- **It starts hidden** and appears only when the `supporter` event says inactive. Showing
  it first would flash it on a supporter's stream every time OBS loads a source. The flip
  side: an overlay that never reaches the server shows no watermark, which is acceptable
  because such an overlay shows nothing else either.
- Position is bottom-right unless `<body data-watermark>` says otherwise. Checked with
  `elementsFromPoint` on all ten pages at 1920x1080 (2560x1440 for `/overlay-1440`):
  bottom-right sat on red player 5's name on the draft overlay; `/result` uses `bottom-left`
  (empty lower part of the red side panel). The stage graphics all keep 62px or more of
  bottom padding, so bottom-right is clear on them.
- **Corner placement follows the data** (2026-09-28, after the user saw the mark on the last
  row of a finished 32-team standings table, whose "All teams" panel reaches the bottom edge).
  `placeWatermark()` in `overlay-size.js` tries the corners (`<body data-watermark>` first,
  else bottom-right; then bottom-left, top-right, top-left) and scores each: area of
  **content** under the mark (+8 px) x 1000, plus area of **panels** under it. Content = text
  measured by its letters (`Range.getClientRects`, because a footnote's box can span the screen
  while its words fill a third of it), IMG/SVG/CANVAS, and boxes under a quarter of the screen
  with a fill, picture or border. Panels = painted boxes from a quarter to 90% of the screen
  (the table card); bigger is the stage backdrop and ignored. First score of 0 wins, else the
  lowest. Opacity-0 elements count (entrance animations). Runs 300 ms after load, at 2.5 s,
  600 ms after any content change (MutationObserver childList/characterData; not attributes,
  so moving the mark cannot retrigger it), on resize, and when the mark is shown.
  **Test trap:** my iframe-based checks ran a cached older `overlay-size.js` and measured a
  shorter table than the real page; trust only checks on the page itself at 1920x1080.
  Verified that way on a throwaway server with a seeded 32-team single-elim (finished, "Final
  standings / All teams"), a 32-team group stage and a live match: every graphic clear; the
  32-team table forced to the bottom edge sends the mark top-right. The draft overlays keep the
  banner. Logo 2.8 x the text (64 px in corners, 59 in the banner = the ban slots' height).
- **Draft overlays: inside the banner** (user's request, 2026-09-28, replacing an
  "above the panel" spot from the same day). `/overlay` and `/overlay-1440` mark
  `.pick-section` with `data-watermark-slot`; `overlay-size.js` then puts the mark inside it
  (17px, right-aligned 336px from the right edge, `top: 41px; translateY(-50%)`: just left
  of the red ban slots, its middle on theirs). Inside the panel, the container's 4/3 scale
  carries it to 1440. **Layout pixels tied to the banner; move them if it changes.**
  `overlay.js` never rebuilds `.pick-section`, which is why appending into it is safe.
- **The logo is part of the mark** (user's request, 2026-09-28): `<img>` of
  `watermark-logo.png` then a `<span>` with the text, inside the one `.rov-watermark` flex
  row, 1.45em tall (25px in the banner, 28px in corners) at 85% like the text, with a drop
  shadow. Being a child, it hides with the mark: no second element for a key to miss. Two
  earlier tries the same day were dropped: 84px behind the tournament name, then 150px at 60%
  behind the score's VS (that one needed `z-index: -1` inside `.match-center`, a stacking
  context, to stay under the score; worth knowing if a logo ever goes back there).
- `watermark-logo.png` is the app icon's shield with the dark tile cut away (kept: pixels
  with `luminance + 200 × saturation` above ~140, i.e. the gold and silver), cropped to
  169x175. Made once from `app-icon.ico`; remake it the same way if the icon changes.
- Tests: every `/overlay*` route and `/result` (derived from `PAGES`) loads
  `overlay-size.js` after its own script; the watermark starts hidden.

**Built in S3 (2026-09-28).**
- Settings, second section (under Language): the hint, a status line with a gold star when
  active, **Remove key** (confirm first, `danger`), a paste box with a placeholder and
  **Use this key**. Errors are toasts in the app's language by `code` (`Supporter.Err.*`).
  **Become a supporter** is hidden while `SettingsViewModel.SupporterPageUrl` is empty,
  which it is until the maker has a page.
- `AppServices` listens to the `supporter` socket event (`Supporter`, `SupporterChanged`).
  Status is null until the server speaks, and the screen says "waiting" rather than "no key".
- **Reminder:** a toast, never a dialog, when an active key has 7 days or fewer left or a key
  has run out, at most once a day (`AppSettings.SupporterRemindedOn`, invariant date).
- Dates show as `2 Oct 2026` / `2 ต.ค. 2569` via `SupporterDates.Show` and `Loc.Instance.Culture`.
- Disclaimer (`Settings.Disclaimer`) under About, in the same words Spectra uses for Riot.
- Verified: snapshots of no key, 5 days left (Thai) and expired (English), with the toasts;
  then `scripts/uia.ps1 -Action set-text` (new) and clicks in a live window against a
  throwaway backend on port 3000: bad key → error toast; a key wrapped over three lines →
  accepted with the thank-you; Remove → confirm → gone. The user's real data folder was
  never written.

**3.2.0-beta.1 built locally 2026-09-28, not published** (`pack.ps1 -Version 3.2.0-beta.1 -Channel beta`,
no `-Publish`): `releases/RovOverlayTool3-beta-Setup.exe` and `-beta-Portable.zip`, notes in
`docs/release-notes/3.2.0-beta.1.md`. The portable copy passed `smoke.ps1`; the bundle holds
`supporter.js` and the watermark, and neither the key tool nor the secret key. `package.json` and
the csproj still say 3.1.2 (pack passes the version to dotnet only); bump both before a real release.
The user is trying it with a one-month test key. **3.2.0-beta.2** (same way, 2026-09-28) moves the draft overlay's watermark into the banner with the logo behind the title; not smoke-tested because the user's installed app held the single-instance lock, and only overlay files changed since beta.1 passed. **3.2.0-beta.3** (2026-09-28): the logo moves behind the score at 150px; same build, same caveat. **3.2.0-beta.4** (2026-09-28): the logo becomes a small shield inside the mark, before the text. **3.2.0-beta.5** (2026-09-28): the app is renamed Nuzka.

**Support screen, in the app (2026-09-28, user's request instead of a web page).**
- Sidebar item **Support** (heart, ``), docked just above Settings: `ShellViewModel.SupportItem`,
  `SupportViewModel` / `SupportView`, `--page Support`. Settings' "Become a supporter" button is
  now always shown and selects it (`shell.NavigateTo("Support")`); `SettingsViewModel` takes the
  shell for that. `SettingsViewModel.SupporterPageUrl` is gone.
- The key box, status line and remove button moved out of Settings into **`SupporterPanel`**
  (`ViewModels/SupportViewModels.cs`); Settings and Support each hold one and bind `Supporter.*`.
- The screen: lead line, your key, what you get, price, how to get a key (four steps and a
  **Get a key** button), questions, the Garena/Tencent line. Text in `Loc.Supporter.cs`.
- **What the maker fills in** lives in one file, `Services/SupporterOffer.cs`: `MonthlyPrice`
  (the label only), `YearlyPrice`, and **`ShopUrl`**, the deployed key shop. Empty
  `ShopUrl` leaves the button disabled, reading "Buying opens soon". Changing any of these
  needs an app update. (A PromptPay-QR-and-send-a-slip version existed for an hour on
  2026-09-28; the user found it too complicated, and its QR/contact fields and the csproj
  `Assets**` rule are gone.)
- Verified by snapshots in both languages. The Settings button was not clicked in a live
  window: the user's installed app held the single-instance lock.

**Key shop, `cloud/` (S5, built 2026-09-28; deployed the same day to `https://nuzka-keys.nuzka.workers.dev` with the Stripe *sandbox* key; `SupporterOffer.ShopUrl` points there. /buy verified to 303 to a `cs_test_` Checkout. **The user made a test purchase in beta.7 on 2026-09-28: key shown, pasted, watermark gone in OBS.** **Live since 2026-09-28**: `STRIPE_SECRET_KEY` is a *restricted* live key (`rk_live_`, Checkout Sessions: Write only, which was enough), and /buy returned a `cs_live_` Checkout. A real purchase + refund is still to be done).** User's choice after comparing
Stripe, Opn/Omise and GB Prime Pay: **Stripe** (sole proprietors allowed in Thailand;
PromptPay 1.65%, Thai cards 3.65% + ฿10; hosted Checkout, so no payment page of our own).
- A Cloudflare Worker, plain ESM and Web Crypto only (runs under `node --test` too):
  `GET /buy?lang=` creates a Checkout Session (`mode=payment`, PromptPay + card, THB
  `PRICE_SATANG`, a custom field for the name on the key, `metadata.product =
  nuzka-supporter`, `metadata.months`) and 303s to Stripe. `GET /done?session_id=` fetches
  the session **from Stripe with the secret key** and only signs when it is paid, ours, THB
  and at least the price; unpaid shows a self-refreshing waiting page; unknown ids 404.
- **No database.** Key id = first 12 hex of SHA-256(session id); issued = the Bangkok date
  it was created; expires = + `metadata.months`; Ed25519 is deterministic, so a session
  always yields the same key. Lost key: reopen `/done`. Refund: `supporter-keys.js
  shop-id cs_...` gives the id for `revoked-keys.json`.
- **The signing secret now also lives in Cloudflare** (`SIGNING_KEY_PEM` Worker secret), next
  to `STRIPE_SECRET_KEY`. cloud/README.md says what to do if either leaks.
- PromptPay cannot be a Stripe subscription, so it stays one payment per month; the app's
  7-day reminder is what brings people back. Card subscriptions are possible later.
- Tests (`cloud/test/shop.test.js`, 11) fake Stripe and check, above all, that a shop key
  passes the app's own `readKey` from `backend/build`; also same-key-on-reload, HTML in
  names, unpaid, wrong product/currency/amount, bad and unknown ids, Stripe errors kept off
  the page, the exact /buy request, Thai dates. Pages were looked at in a browser, desktop
  and phone width, and the copy button clicked.
- **Next, needs the user:** a Stripe account (test key first), a Cloudflare account,
  `wrangler login / deploy / secret put` in their own terminal (cloud/README.md), then
  `ShopUrl` in the app and a test purchase with card 4242... before the live key.

**Before S1-S3 can ship:** the user sees the watermark in OBS; the key shop is deployed and a
test purchase works; the commits are pushed, which also publishes `revoked-keys.json`.

**Price: ฿159 a month** (user, 2026-09-28), in `SupporterOffer.MonthlyPrice`; no yearly price yet, so the yearly row is hidden (`ShowYearly`). Keys for it: `make --name "..." --months 1`.

**Not decided yet:** a yearly price (Spectra: EUR 15/25/40 a month; Thai guess THB 99-199
a month or 990-1,990 a year), watermark text and corner, perks beyond the watermark, and
whether the free licence should require shared modified copies to keep the watermark
(changing it bumps `LicenceVersion`).

**New app icon (2026-09-28, user's artwork).** A white, round-headed figure in a black-and-red
ink swirl with a red crown. The source WebP already had a transparent background, so it was
only cropped square (1123 px) and resized with WPF (`HighQuality` scaling) into:
`backend/public/images/app-icon.ico` (PNG entries 16-256 px; the exe icon via the csproj and the
installer icon via pack.ps1), `backend/public/images/watermark-logo.png` (128 px, the mark in the
overlay watermark, replacing the gold shield), and `docs/brand/nuzka-logo-1024.png` /
`-512.png` (masters; 512 is small enough for Stripe's branding upload). At 16 px the artwork
turns into a red-and-black blob, so **16, 20 and 24 px use `docs/brand/nuzka-icon-small.png`**:
the cream face and the red crown cut out of the artwork (largest red shape in the crown box;
the face flood-filled from its middle with its holes filled), the crown stacked just above,
a 26 px dark outline round the face so it shows on light backgrounds, and the eyes grown
by 11 px so they survive at 16 px. 32 px and up keep the full artwork (user's request).
