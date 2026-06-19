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

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `~/.tac/config.json`:
   ```json
   {
     "api_key": "YOUR_API_KEY",
     "base_url": "https://api.openai.com/v1",
     "model": "gpt-4o",
     "pet_name": "Tac",
     "behavior_interval_seconds": 20
   }
   ```

3. Run:
   ```bash
   npm start
   ```

## Privacy

Tac builds context for the LLM from your local machine and sends it to **the LLM
endpoint you configure** (`base_url` in your config). This context includes:

- the name of your currently active app and its front window title
- the time of day
- recent chat messages between you and Tac

Nothing is sent anywhere else, and nothing is sent until you provide an API key
and `base_url`. Choose an endpoint you trust — your data is handled according to
that provider's policy.

## Roadmap

- [x] Walk left/right across the screen autonomously
- [x] LLM-driven behavior loop (idle, walk, talk, sleep, react)
- [x] Click-to-chat with speech bubble
- [x] Drag to reposition
- [x] Configurable LLM backend (OpenAI-compatible)
- [ ] Open apps or URLs on command
- [ ] Interact with the active app (e.g., read clipboard, scroll, type)
- [ ] Aware of screen content via vision model
- [ ] Persistent memory across sessions
- [ ] More animations and emotional states
- [ ] Windows/Linux support

## License

[MIT](LICENSE) © Adam Chen
