# Nuzka (formerly ROV Overlay Tool v3)

Native Windows operator app (WPF, .NET 10) in front of v2's Node backend, which still
serves the HTML overlays to OBS. The design, decisions, status and traps are in
`docs/PLAN.md`. Read it before starting work.

## Hard rule

**Never modify, build or run anything in `../rov_pickban_overlay`** (v2). Read from it
only. Even `npm start` there changes its `build/` and opens its database.

## Hard rule: never test against the operator's real data

On 2026-09-28 the user's whole tournament was lost while test runs of the app (snapshots,
smoke.ps1, betas) kept starting and force-closing backends on the real data folder. Test
with a throwaway backend and `--port`:

```bash
ROV_USER_DATA_DIR=<temp>/data ROV_USER_MEDIA_DIR=<temp>/media PORT=3918 node server.js
RovOverlay.Desktop/bin/Debug/net10.0-windows/RovOverlayTool.exe --port 3918 --page Home --snapshot out.png
```

`--port` only ever attaches; it never starts a backend of its own. Plain `--snapshot` without
`--port` still attaches to, or starts, the real one: don't. smoke.ps1 launches the real app on
purpose, so copy the data folder aside first if the operator has anything in it.

Stop a test copy **by the PID you started**, never `taskkill /IM RovOverlayTool.exe`: the
installed app has the same exe name, and that closes the operator's real Nuzka too, skipping its
shutdown backup (done once, 2026-09-28).

## Standing rule: keep the plan current

Every change that moves a milestone updates `docs/PLAN.md` in the same change: §0
status, §7 milestone table, §8 open items (remove what is done, add what the work
exposed), §9 traps (anything that cost real debugging time). A stale plan is worse
than none.

## Commands

Backend (`backend/`):

```bash
npm run build
npm test
npm run dev
```

Desktop (`desktop/`). `dotnet` lives at `C:\Program Files\dotnet\dotnet.exe` and may not
be on PATH in an old shell:

```bash
dotnet build
dotnet run --project RovOverlay.Desktop
```

The desktop app needs the backend built first (it runs `backend/build/server`). Render
a screen without a person at the keyboard:

```bash
RovOverlay.Desktop/bin/Debug/net10.0-windows/RovOverlayTool.exe --page Home --lang en --snapshot out.png
```

**A snapshot is not proof the app starts.** `--snapshot` skips the first-run licence, and
3.0.0 shipped unable to open a window at all because of it. Before releasing anything,
run the smoke test, which launches the app for real and fails unless a visible window
appears:

```powershell
.\scripts\smoke.ps1 -FreshLicence
```

## Where things go

- New operator screens: native, in `desktop/` (see `docs/PLAN.md` §3 for the recipe).
- New data or rules: the backend, with a test, exactly as in v2. The desktop app never
  holds tournament logic of its own.
- `backend/CLAUDE.md` is v2's rulebook. Its rules about the server, the data model and
  the overlays still hold. Its parts about Electron and the HTML operator pages
  describe the pages v3 is replacing.
