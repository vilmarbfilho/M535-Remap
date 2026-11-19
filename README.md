# M535 Remap

A lightweight alternative to Logi Options/Options+ for the **Logitech M535 Bluetooth Mouse** on **macOS (Apple Silicon)**.
It remaps the gesture button, wheel tilt and wheel click without Logitech's drivers, with a visual interface
for configuring actions and per-app profiles.

There are two apps:

| App | Role |
|---|---|
| **M535 Remap Helper** | Native Swift menu bar helper. Talks to the mouse over HID++ and runs the actions. Lightweight, always running. |
| **M535 Remap** | Electron settings interface. Only needs to be open while you configure things. |

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [macOS permissions](#macos-permissions)
- [Usage](#usage)
- [Configuration (`config.json`)](#configuration-configjson)
- [Uninstalling](#uninstalling)
- [Development](#development)
- [Project structure](#project-structure)
- [How it works](#how-it-works)
- [Mouse diagnostics](#mouse-diagnostics)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)

---

## Features

- **Gesture button** (the small button behind the wheel): click + 4 directions (hold and move the mouse), each with its own action.
- **Tilt ← / →** on the wheel, with optional repeat while tilted.
- **Wheel click**: native by default, or remappable.
- **Action types**: system action (24 built in: Mission Control, App Exposé, Spaces, Back/Forward, media, volume,
  tabs, screenshot…), keyboard shortcut, open app (optionally hiding it if it's already frontmost),
  open link/file/folder and shell command.
- **Per-app profiles**, inheriting anything not customized from the Default profile.
- **Interactive diagram** of the M535 with live highlighting of every control (including left, right and scrolling).
- **Light/dark theme** following macOS.
- **English and Brazilian Portuguese**, in both the settings app and the helper's menu (Settings → Language; defaults to the system language).
- The mouse **returns to its factory behavior** whenever the helper quits or is paused.

### Default actions

| Control | Action |
|---|---|
| Gesture: click | Mission Control |
| Gesture: ↑ | Mission Control |
| Gesture: ↓ | App windows (App Exposé) |
| Gesture: ← / → | Previous / next desktop (Spaces) |
| Tilt ← / → | Back / Forward (⌘[ / ⌘]) |
| Wheel click | Native middle click |

---

## Requirements

- macOS 13 or later, Apple Silicon (arm64)
- Logitech M535 paired over Bluetooth (VID `046D`, PID `B016`)
- Xcode Command Line Tools (`xcode-select --install`), for `swift`
- Node.js 22+ and npm 11+

---

## Installation

### 1. Signing certificate (one time only)

```bash
scripts/create-signing-cert.sh
```

Creates a self-signed `M535Remap Local Signing` certificate in your Keychain and asks for your password to trust it
for code signing. **Why:** macOS ties the Accessibility and Input Monitoring permissions to the app's signature.
With the default ad-hoc signature they would be lost on every rebuild. No Apple developer account is needed — the
app only runs on your machine.

> On the first build macOS may ask whether `codesign` can use the key: choose **Always Allow**.

### 2. Interface dependencies

```bash
cd app
npm install
```

### 3. Build and install the app

```bash
cd app
npm run package
```

This builds the helper and the interface, packages everything into `build/` and installs **`~/Applications/M535 Remap.app`**
(with the helper bundled). Open the app: it shows **"Install helper"** at the top — click it to install and start
**M535 Remap Helper**.

Terminal alternative (installs/updates only the helper and restarts it):

```bash
scripts/build-helper.sh --install
```

### 4. Permissions

Grant the permissions to **M535 Remap Helper** (see below). Done: the mouse icon appears in the menu bar.

---

## macOS permissions

The **helper** needs two permissions, under **System Settings → Privacy & Security**:

| Permission | What for |
|---|---|
| **Input Monitoring** | Open the mouse via IOHID and receive gesture button/tilt events |
| **Accessibility** | Send synthetic keyboard shortcuts, clicks and media keys |

The helper asks for both on launch. If the menu bar icon shows ⚠︎, use the menu options
(**Grant Input Monitoring…**, **Grant Accessibility…**) and then **Restart to apply permissions**.
If the app isn't listed, click **+** and choose `~/Applications/M535 Remap Helper.app`.

The interface (M535 Remap) does **not** need any permissions.

---

## Usage

### Interface

- **Diagram**: click a control to edit it. When you use the mouse, the control lights up on screen
  (and gets selected, if "Select on press" is enabled in Settings).
- **Gesture pad**: pick the click or one of the 4 directions of the gesture button.
- **Editor**: choose the action type, see a preview of what happens and use **Test action**.
  - *Shortcut*: click **Record shortcut** and press the keys (Esc cancels).
  - *App*: **Choose…** opens the application picker.
- **Profiles**: **Profile for an app…** creates a profile that's active while that app is in the foreground. Controls
  that aren't customized use Default; **Inherit from Default** undoes a customization.
- **Settings**: language, pause remapping, launch at login, gesture sensitivity, tilt repeat, log,
  helper install/update and uninstall.

Everything is saved automatically; the helper applies changes immediately.

### Menu bar (helper)

Shows the mouse's connection and battery and the active profile, and lets you pause remapping, enable launch at login,
open the settings, view the log and restart/quit. **Quit** returns the mouse to its factory behavior.

### How to do gestures

Hold the **small button behind the wheel**, **move the whole mouse** in the desired direction and release. The action
fires on release. With no movement, it counts as a click. (Tilting the wheel sideways is the *tilt*, a separate control.)

---

## Configuration (`config.json`)

File: `~/Library/Application Support/M535Remap/config.json`. The interface edits it, but it can also be edited
by hand — the helper reloads it on save and, if the JSON is invalid, keeps the previous configuration and warns you.
Full example in [`config.example.json`](config.example.json).

```jsonc
{
  "version": 1,
  "settings": {
    "enabled": true,              // remapping enabled
    "gestureThreshold": 50,       // minimum movement for a click to become a gesture
    "tiltRepeatIntervalMs": 0,    // 0 = no tilt repeat
    "tiltRepeatDelayMs": 400,
    "language": "en"              // "en" or "pt-BR"; omit to follow the system language
  },
  "profiles": [
    {
      "id": "default", "name": "Padrão", "apps": [],
      "bindings": {
        "gestureUp": { "type": "system", "action": "missionControl" }
      }
    },
    {
      "id": "com.apple.finder", "name": "Finder", "apps": ["com.apple.finder"],
      "bindings": {
        "gestureUp": { "type": "openApp", "bundleId": "com.apple.Terminal", "name": "Terminal", "toggle": true }
      }
    }
  ]
}
```

The `default` profile's `name` is only a stored label; the interface always shows it translated ("Default" / "Padrão").

**Controls** (`bindings` keys): `gestureClick`, `gestureUp`, `gestureDown`, `gestureLeft`, `gestureRight`,
`tiltLeft`, `tiltRight`, `middleClick`.

**Actions:**

| `type` | Fields | Example |
|---|---|---|
| `system` | `action` | `{"type":"system","action":"spaceLeft"}` |
| `keystroke` | `keyCode` (macOS virtual keycode), `modifiers` (`cmd`, `shift`, `option`, `ctrl`, `fn`), `keyLabel` | `{"type":"keystroke","keyCode":8,"modifiers":["cmd"],"keyLabel":"C"}` |
| `openApp` | `bundleId` and/or `path`, `name`, `toggle` | `{"type":"openApp","bundleId":"com.apple.Safari"}` |
| `openURL` | `url` (a link, or a file/folder path starting with `/` or `~`) | `{"type":"openURL","url":"~/Downloads"}` |
| `shell` | `command` (run with `/bin/zsh -lc`) | `{"type":"shell","command":"say hello"}` |
| `default` | — | Native behavior (`middleClick` only) |
| `none` | — | Does nothing |

Available system actions: `missionControl`, `appExpose`, `showDesktop`, `launchpad`, `spaceLeft`, `spaceRight`,
`fullscreen`, `closeWindow`, `back`, `forward`, `previousTab`, `nextTab`, `zoomIn`, `zoomOut`, `middleClick`,
`playPause`, `nextTrack`, `previousTrack`, `volumeUp`, `volumeDown`, `mute`, `spotlight`, `screenshot`, `lockScreen`.

---

## Uninstalling

Deleting the apps does **not** remove the configuration, logs, preferences or permissions. Use one of the options below.

### From the app

**Settings → Installation → Uninstall…** Confirm in the macOS dialog (removing the signing certificate is a
separate option, unchecked by default). The app quits and the removal finishes on its own; the result is written to
`/tmp/m535remap-uninstall.log`.

### From the terminal

```bash
scripts/uninstall.sh                # asks for confirmation
scripts/uninstall.sh --dry-run      # only shows what would be done
scripts/uninstall.sh --yes          # no confirmation
scripts/uninstall.sh --remove-cert  # also removes the signing certificate
scripts/uninstall.sh --keep-ui      # keeps the settings app
```

The script:

1. disables launch at login;
2. **quits the helper**, returning the mouse to its factory behavior;
3. resets the Input Monitoring and Accessibility permissions;
4. removes `M535 Remap Helper.app` and `M535 Remap.app` from `~/Applications` (only apps with the project's bundle id);
5. removes configuration, logs and preferences:
   - `~/Library/Application Support/M535Remap`
   - `~/Library/Application Support/M535 Remap`
   - `~/Library/Logs/M535Remap`
   - `~/Library/Preferences/com.m535remap.settings.plist`

The **project's source code is never touched**. If resetting a permission fails (the script warns with ⚠︎), remove it
manually in Privacy & Security with the **−** button.

> If the helper is deleted while running, or crashes, the gesture button and tilt stay diverted until the mouse is
> turned off and on again. The uninstaller always quits the helper first.

---

## Development

```bash
# Interface with live reload (Vite + Electron)
cd app && npm run dev

# Type checking
cd app && npm run typecheck

# Build the interface (without packaging)
cd app && npm run build

# Helper: build and assemble build/M535 Remap Helper.app (signed)
scripts/build-helper.sh

# Helper: build, install to ~/Applications and restart
scripts/build-helper.sh --install

# Full app: helper + interface packaged and installed to ~/Applications
cd app && npm run package
```

Run the helper straight from the terminal (logs to stdout; uses the terminal app's permissions):

```bash
cd helper && swift build -c release && "$(swift build -c release --show-bin-path)/M535Helper" --verbose
```

Non-interactive capture of the interface (handy for reviewing the visuals):

```bash
M535_SCREENSHOT=/tmp/ui.png M535_THEME=dark M535_HASH=settings \
  "build/M535 Remap-darwin-arm64/M535 Remap.app/Contents/MacOS/M535 Remap" --user-data-dir=/tmp/m535-ui --lang=en-US
```

`M535_THEME` accepts `light`/`dark`; `M535_HASH=settings` opens Settings; `--lang` (`en-US`, `pt-BR`) picks the
initial language when none has been chosen yet.

### Translations

UI strings live in `app/src/shared/i18n/`: `en.ts` is the reference dictionary and `pt-BR.ts` must match its shape
(the type checker enforces it). To add a language, create a new dictionary typed as `Messages` and register it in
`i18n/index.ts`, and add the helper's strings in `helper/Sources/M535Helper/App/Strings.swift`.

The chosen language is saved as `settings.language` in `config.json`, which is how the helper's menu follows it.
The UI also caches it in local storage (for startup) and sends it to the Electron main process, which uses it for
native dialogs and error messages. The helper's log is always in English.

### Helper IPC protocol

Unix socket at `~/Library/Application Support/M535Remap/helper.sock`, one JSON message per line:

```bash
printf '{"id":1,"method":"status"}\n' | nc -U -w 1 ~/Library/Application\ Support/M535Remap/helper.sock
```

Methods: `ping`, `status`, `reloadConfig`, `setEnabled {enabled}`, `runAction {action}`,
`requestPermission {kind}`, `setLaunchAtLogin {enabled}`.
Events sent by the helper: `status`, `configError`, `control {control, phase}`
(phases `down`, `up`, `fire`, `scrollUp`, `scrollDown`).

---

## Project structure

```
m535/
├── helper/                       # Native helper (Swift Package)
│   ├── Sources/M535Helper/
│   │   ├── Device/M535Device.swift    # IOHID + HID++ 2.0 (diversion, raw XY, battery)
│   │   ├── Capture/RemapEngine.swift  # gestures, tilt, wheel click → actions
│   │   ├── Actions/ActionRunner.swift # shortcuts, system actions, apps, URLs, shell
│   │   ├── Config/                    # config.json model and read/write
│   │   ├── IPC/IPCServer.swift        # JSON-lines Unix socket
│   │   └── App/                       # menu bar, permissions, login item, log
│   └── Support/                  # helper Info.plist and icon
├── app/                          # Interface (Electron + React + TypeScript + Tailwind)
│   ├── electron/                 # main process, preload, helper client
│   ├── src/
│   │   ├── components/           # diagram, gesture pad, editor, previews, panels
│   │   ├── shared/               # config schema (zod), keycodes and i18n dictionaries
│   │   ├── lib/                  # helper API bridge and i18n React context
│   │   └── data/actions.ts       # system action catalog
│   ├── scripts/                  # dev, Electron build, packaging
│   └── build-resources/          # icon (svg, png, icns)
├── diagnostics/m535diag.swift    # mouse diagnostics tool
├── scripts/
│   ├── create-signing-cert.sh    # self-signed certificate
│   ├── build-helper.sh           # helper build/install
│   └── uninstall.sh              # uninstaller
└── config.example.json
```

---

## How it works

Besides the standard HID mouse, the M535 exposes Logitech's **HID++ 2.0** protocol (reports `0x10`/`0x11`).
Through the **ReprogControlsV4 (`0x1B04`)** feature the helper "diverts" controls: the mouse stops performing the
native behavior and notifies the helper instead.

| CID | Control | Diversion |
|---|---|---|
| `0x00D0` | Gesture button | with **raw XY** (the cursor stays still during the gesture) |
| `0x00CE` | Tilt ← | plain |
| `0x00CF` | Tilt → | plain |
| `0x0052` | Wheel click | plain, only if some profile remaps it |

Left, right and scrolling aren't diverted; the helper only reads the native `0x02` report for the live highlight.

Firmware quirks found during diagnostics (already handled in the code):

- **Always use the long report (`0x11`)**: with the short one, the firmware reads garbage for the missing parameters
  and randomly replies with error `0x02`.
- To restore a control, use flags **`0x22`**; `0x02` leaves raw XY on.
- `getCidReporting` returns inconsistent data, so the helper doesn't trust reading state back: it keeps the desired
  state and reapplies it on every connection — and also when it detects the mouse lost the diversion (e.g. on
  wake), by seeing the gesture button's native ⌃↑ shortcut arrive.
- Diversion isn't persistent: turning the mouse off always returns it to the default.

---

## Mouse diagnostics

`diagnostics/m535diag.swift` was used to map out the controls and the protocol; useful if something changes
(another firmware, another model):

```bash
cd diagnostics
swiftc -O m535diag.swift -o m535diag
./m535diag perms          # permission status
./m535diag hidpp          # HID++ version, features and reprogrammable controls
./m535diag monitor        # raw HID reports side by side with macOS events
./m535diag divert --moves # diverts gestures/tilt and shows CIDs and directions (Ctrl+C restores)
./m535diag reset          # restores the controls to the default
```

Quit the helper before using `divert`, so the two don't fight over the mouse. The generated `.txt` files are kept
out of git (`monitor` records what's typed on the keyboard).

---

## Troubleshooting

| Symptom | What to do |
|---|---|
| ⚠︎ icon in the menu bar | A permission is missing: grant it from the helper menu, then **Restart to apply permissions**. |
| "Helper offline" in the interface | Click **Start helper** (or **Install helper** if it isn't installed). |
| Gesture ← / → doesn't switch desktops | Enable ⌃← / ⌃→ in Settings → Keyboard → Shortcuts → Mission Control, and have more than one desktop. |
| Shortcuts do nothing | M535 Remap Helper is missing the **Accessibility** permission. |
| Permissions disappear after a rebuild | The build was signed ad-hoc: run `scripts/create-signing-cert.sh` and rebuild. |
| Buttons "stuck" after the helper crashes | Turn the mouse off and on (diversion isn't persistent). |
| Old icon in the Dock/Finder | macOS cache; it updates by itself or when the app is reopened. |
| See what the helper is doing | Menu → **Show log**, or `~/Library/Logs/M535Remap/helper.log`. |

---

## Limitations

- The **left, right and scrolling** controls stay native (they show as "Native" in the diagram).
- The shortcut recorder can't capture combinations reserved by the system (e.g. ⌘Space).
- "Mission Control", "App windows", "Show desktop" and "Launchpad" use a private Dock API, with fallbacks
  in case it doesn't exist; Launchpad may not open on macOS versions that replaced it.
- The settings app takes ~250 MB because of Electron; the remapping itself lives in the helper, which is lightweight.
- Tested only with the M535 (`046D:B016`, firmware 18.0.3) over Bluetooth.
