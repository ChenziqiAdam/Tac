# Tachikoma

An LLM-powered desktop pet for macOS. Tac lives on your screen, watches what you do, and occasionally walks around, reacts, or chats with you.

<p align="center">
  <img src="assets/sprites/idle.gif" width="96" alt="Tac idle" />
</p>

## Features

- Roams your desktop autonomously, driven by an LLM behavior loop
- Reacts to context: active app, time of day, your messages
- Click to chat — type a message and Tac responds in a speech bubble
- Drag to reposition anywhere on screen
- Configurable: bring your own model, API key, and system prompt

## Install (end users)

1. Download the latest `Tac-<version>-arm64.dmg` (Apple Silicon) or
   `Tac-<version>.dmg` (Intel) from the
   [Releases page](../../releases/latest).

2. Open the `.dmg` and drag **Tac** into your Applications folder.

3. Tac is not yet code-signed or notarized (expected for v0.1), so macOS Gatekeeper
   will block the first launch. Clear the quarantine flag:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Tac.app
   ```
   Then open Tac normally. (Alternatively: right-click **Tac** → **Open** → **Open**.)

4. On first launch Tac opens its **Settings** window. Enter your API **Base URL**,
   **Model**, and **API Key**, click **Test connection** to confirm it works, then
   **Save**.

5. Grant **Accessibility** permission when prompted — or any time via the
   **Open Accessibility Settings** button in Settings — so Tac can notice which app
   you're using.

## Run from source (developers)

1. Install dependencies and start the app:
   ```bash
   npm install
   npm start
   ```

2. On first run, configure Tac in the **Settings** window (tray icon → Settings, or it
   opens automatically when no API key is set).

   Settings are stored in `~/.tac/config.json`. You can edit it directly if you prefer:
   ```json
   {
     "api_key": "YOUR_API_KEY",
     "base_url": "https://api.openai.com/v1",
     "model": "gpt-4o",
     "pet_name": "Tac",
     "behavior_interval_seconds": 20
   }
   ```

## Build the .dmg

```bash
npm install
npm run icns    # regenerate assets/icon.icns from assets/icon.png (only if it changed)
npm run dist    # outputs the .dmg to dist/
```

The build is **unsigned**. To enable code signing and notarization later, set
`CSC_LINK` / `CSC_KEY_PASSWORD` (signing identity) and `APPLE_ID` /
`APPLE_APP_SPECIFIC_PASSWORD` (notarization) in your environment, flip
`mac.hardenedRuntime` to `true`, and add a `mac.notarize.teamId` entry in the
`build` block of `package.json`.

## Privacy

Tac builds context for the LLM from your local machine and sends it to **the LLM
endpoint you configure** (`base_url` in your config). This context includes:

- the name of your currently active app and its front window title
- the time of day
- recent chat messages between you and Tac
- a short running summary of your past conversations

Nothing is sent anywhere else, and nothing is sent until you provide an API key
and `base_url`. Choose an endpoint you trust — your data is handled according to
that provider's policy.

Tac keeps recent chat turns and that summary locally at `~/.tac/memory.json` so it
remembers you across launches. Clear it any time with **Forget everything** in
Settings → Memory, or by deleting the file.

## Web access (optional)

Tac can offer to open web pages, but this is **off by default** and strictly limited.
In Settings → **Web access**, list the domains Tac may open (one per line). Tac can then
only open `http`/`https` pages on those domains (and their subdomains); every other
request is refused. The check runs in Tac's main process, not in the prompt, so a
model — even one nudged by untrusted text like a window title — cannot open a site you
did not allow. Leave the list blank to disable opening entirely.

## Roadmap

- [x] Walk left/right across the screen autonomously
- [x] LLM-driven behavior loop (idle, walk, talk, sleep, react)
- [x] Click-to-chat with speech bubble
- [x] Drag to reposition
- [x] Configurable LLM backend (OpenAI-compatible)
- [x] Open URLs on command (allowlisted domains only)
- [ ] Interact with the active app (e.g., read clipboard, scroll, type)
- [ ] Aware of screen content via vision model
- [x] Persistent memory across sessions
- [x] Mood-based expressions (color tint per emotional state)
- [ ] Windows/Linux support

## License

[MIT](LICENSE) © Adam Chen
