# Botman — The Batcomputer AI Assistant Client

Welcome to **Botman**, a high-performance Batcave-themed AI assistant client built using modern web standards (Vanilla HTML, CSS, and JS). This interface is designed with a premium, obsidian-and-gold theme featuring glowing neon animations, persistent mission logs, markdown code block syntax coloring, and live Gemini API integration.

## Key Features

- **Batcave Aesthetics**: Dark graphite panels (`#0b0c10`), gold/yellow accents (`#ffcc00`), glowing spotlight hover states, and smooth micro-animations.
- **Persistent Mission Logs**: All conversations, custom model core selections, and parameters are saved automatically on your local device inside `localStorage`.
- **Intelligent Response Engine (Dual Mode)**:
  - **Live Mode**: Paste your **Gemini API Key** in settings to communicate directly with official models (`gemini-2.5-flash` or `gemini-2.5-pro` mapped to Batcomputer Cores).
  - **Simulated Mode**: If no API key is specified, it routes queries to offline fallback protocols, returning simulated thinking process logs and detailed, formatted answers in Botman's deep, analytical voice.
- **Surveillance & Code Formatting**: Beautifully formats code blocks (with syntax highlights and a copy button), list structures, and custom headers.
- **Collapsible Reasoning Drawer**: Displays active search and decryption steps in an expandable panel before streaming the final response.
- **Fully Responsive Layout**: Built with CSS Grid/Flexbox, featuring a slide-out hamburger navigation menu for mobile screens.

## Quick Start

You can run this application locally without any build steps:

### Option A: Double-Click
1. Open the project folder.
2. Double-click [index.html](file:///C:/Users/HI/antigravity/radiant-kepler/index.html) to open it directly in any modern web browser.

### Option B: Local Server
If you want to run it via a local static web server:
1. Open a terminal in the project directory.
2. Run a simple HTTP server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Or using Node.js
   npx serve .
   ```
3. Open `http://localhost:8000` or `http://localhost:3000` in your browser.

## Configuration

To activate live API connections:
1. Click **Batcomputer Link** (gear icon) in the bottom-left of the sidebar.
2. Paste your Google Generative AI Developer Key (obtainable for free from [Google AI Studio](https://aistudio.google.com/)).
3. Adjust the creativity variance (**Temperature**) slider as needed.
4. Click **Secure Settings** and start chatting!
