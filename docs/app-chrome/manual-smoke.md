# App Chrome Cluster — Manual Smoke Checklist

Run when changing anything related to the cluster, IconRail, ProjectPicker, or settings panel.

## Picker pass

- [ ] Launch app with no recent projects, not connected to any account
- [ ] Cluster shows top-right: ⚙️ + `EN ▾` + `🔴 Not connected`
- [ ] Bottom-left of picker is empty (no auth status bar there anymore)
- [ ] Click ⚙️ → settings panel opens; close → cluster unchanged
- [ ] Click `EN ▾` → dropdown appears below with English / עברית items
- [ ] Click `עברית` → chrome flips to Hebrew, dropdown closes, cluster moves to top-LEFT
- [ ] Click `HE ▾` (now on left) → dropdown appears; click `English` → flips back, cluster returns top-RIGHT
- [ ] Click `🔴 Not connected` → API key entry panel opens (same flow as before)
- [ ] After authenticating, chip becomes `🟢 your-email@example.com`
- [ ] Click the connected chip → no-op (disabled when connected)

## Project pass

- [ ] Open a project from the picker
- [ ] Cluster's status slot transitions from chip to `HeaderStatusPill` (cost / tokens)
- [ ] ⚙️ + `EN ▾` unchanged in position
- [ ] IconRail's bottom action area: ⚙️ is GONE; only ⚙️ Settings (was here) is removed; 🐞 (when dev mode on) remains

## Cmd+, shortcut

- [ ] On picker: Cmd+, opens settings; Esc closes
- [ ] In project: Cmd+, opens settings; Esc closes
- [ ] In an input/textarea (e.g., chat input): Cmd+, still opens settings (no interference with text)
- [ ] On Windows/Linux: Ctrl+, works the same way

## Settings panel context-awareness

- [ ] On picker: open Settings → Workspace nav. Section shows: "Open a project to manage workspace settings."
- [ ] In a project: open Settings → Workspace nav. Section shows the regular content.
- [ ] All other sections (General, Language, Agents, Mobile, Integrations, About) work normally regardless of whether a project is open.

## Hebrew RTL

- [ ] Switch to Hebrew via the cluster's dropdown
- [ ] Cluster moves to top-LEFT
- [ ] Dropdown panel appears on the LEFT of the badge (not right)
- [ ] All cluster labels are Hebrew (aria attributes too)

## Edge cases

- [ ] Toggle dev mode (tap version 7 times in About) → 🐞 appears in IconRail bottom; cluster unchanged
- [ ] Disable dev mode → 🐞 disappears from IconRail; cluster unchanged
- [ ] OFFICE_DEV=1 launch → both ⚙️ (cluster) and 🐞 (rail) work; settings → about shows "forced on by env" message
