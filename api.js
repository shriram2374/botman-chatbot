/**
 * Botman — API Service Layer
 * Coordinates real calls to Gemini API or generates high-fidelity simulated responses.
 */

const API_SERVICE = {
  /**
   * Generates a streamed response.
   * @param {string} model - Selected model name
   * @param {string} prompt - User prompt
   * @param {Array} history - Previous chat logs [{role: 'user'|'assistant', content: '...'}]
   * @param {Object} config - { apiKey: string, temperature: number }
   * @param {Function} onChunk - (text) => {}
   * @param {Function} onThinking - (thinkingText) => {}
   * @param {AbortSignal} signal - Signal to abort the fetch request
   */
  async generateResponse(model, prompt, history, config, onChunk, onThinking, signal) {
    const isSimulated = model.endsWith('-sim') || !config.apiKey;

    if (isSimulated) {
      await this.runSimulatedResponse(model, prompt, onChunk, onThinking, signal);
    } else {
      await this.runGeminiResponse(model, prompt, history, config, onChunk, signal);
    }
  },

  /**
   * Performs a real API fetch call to Google Generative AI (Gemini).
   */
  async runGeminiResponse(model, prompt, history, config, onChunk, signal) {
    const apiKey = config.apiKey;
    const temperature = config.temperature ?? 0.7;
    
    // API endpoint for streaming contents
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // Format the conversation history
    const contents = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Add the new user prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const requestBody = {
      contents: contents,
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: 2048,
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: signal
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP error ${response.status}`;
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Save remaining partial line

        for (const line of lines) {
          let cleanLine = line.trim();
          
          if (cleanLine.startsWith("data: ")) {
            cleanLine = cleanLine.substring(6).trim();
          }

          if (!cleanLine || cleanLine === "[" || cleanLine === "]") continue;
          
          if (cleanLine.endsWith(",")) {
            cleanLine = cleanLine.slice(0, -1).trim();
          }

          try {
            const parsed = JSON.parse(cleanLine);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              onChunk(text);
            }
          } catch (e) {
            // Keep buffering, might be partial JSON chunk
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        onChunk("\n\n*[Uplink transmission terminated by user]*");
      } else {
        throw error;
      }
    }
  },

  /**
   * Run a simulation with streaming "thinking steps" and response chunks.
   */
  async runSimulatedResponse(model, prompt, onChunk, onThinking, signal) {
    const lowercasePrompt = prompt.toLowerCase();
    let responseText = "";
    let thinkingSteps = [
      "Accessing Batcomputer database...",
      "Decrypting regional security feeds...",
      "Synthesizing response protocols...",
      "Routing signal via Wayne Enterprises satellites..."
    ];

    // Determine mockup response based on user input keywords
    if (lowercasePrompt.includes("harbor") || lowercasePrompt.includes("camera") || lowercasePrompt.includes("python") || lowercasePrompt.includes("scrape")) {
      thinkingSteps.push("Constructing OpenCV network parser...", "Compiling Gotham Port image feeds...");
      responseText = `I have compiled a custom Python scripts template to connect to the Gotham Harbor surveillance cameras, fetch their media logs, and download frame snapshots into a CSV registry directory.

### Installation
Run the following pip installer commands in your Batcave setup:
\`\`\`bash
pip install requests beautifulsoup4 opencv-python
\`\`\`

### Python Implementation
\`\`\`python
import csv
import cv2
import requests
from bs4 import BeautifulSoup

def scan_harbor_webcams(url, csv_output="harbor_snapshots.csv"):
    # Secure user-agent mimicking Batcomputer nodes
    headers = {
        "User-Agent": "Batcomputer-Core/X-12"
    }
    
    print(f"[+] Uplink established. Scanning harbor feed indices at: {url}")
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"[-] Surveillance hook failure: {e}")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    camera_feeds = []

    # Identify surveillance stream items
    for idx, cam in enumerate(soup.find_all('div', class_='surveillance-node'), start=1):
        name = cam.find('h4').get_text().strip() if cam.find('h4') else f"Camera-Feed {idx}"
        feed_url = cam.find('a').get('href') if cam.find('a') else ""
        resolution = cam.find('span', class_='resolution').get_text().strip() if cam.find('span') else "1080p"

        camera_feeds.append({
            "camera_id": f"CAM-GOTHAM-{idx:03d}",
            "name": name,
            "feed_url": feed_url,
            "status": "ONLINE" if feed_url else "OFFLINE"
        })

    # Export records to Batcomputer registry log
    with open(csv_output, mode='w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=["camera_id", "name", "feed_url", "status"])
        writer.writeheader()
        for feed in camera_feeds:
            writer.writerow(feed)
            
    print(f"[+] Surveillance scan finalized. {len(camera_feeds)} camera paths exported to {csv_output}.")

if __name__ == "__main__":
    scan_harbor_webcams("https://surveillance.gotham.gov/harbor")
\`\`\`

### Surveillance Analysis
- **Timeout parameters**: The requests are throttled with a 10s timeout to bypass active GCPD firewall locks.
- **Batcomputer Registry**: The CSV serves as an indexing map to run further live frame-capture algorithms using OpenCV (\`cv2\`).`;

    } else if (lowercasePrompt.includes("security") || lowercasePrompt.includes("batcomputer") || lowercasePrompt.includes("sql") || lowercasePrompt.includes("database")) {
      thinkingSteps.push("Comparing schema security firewalls...", "Evaluating SQL relational constraints against Oracle nodes...");
      responseText = `### Batcomputer Database Integration Protocols

For managing complex vigilante networks, GCPD intelligence, and Arkham inmate telemetry, a hybrid database configuration is used. Here is a structural comparison of SQL Relational Integrity vs NoSQL Decentralization schemas:

| System Attribute | SQL (GCPD Criminal Registry) | NoSQL (Batcomputer Tactical Logs) |
| :--- | :--- | :--- |
| **Data Integrity** | High ACID compliance (Strict schema). | BASE consistency (Highly flexible). |
| **Core Structure** | Relational tables (Foreign Keys). | Document stores (JSON/Binary maps). |
| **Typical Use-Cases** | Booking logs, warrants, case history. | Real-time tracking, satellite metrics. |
| **Access Latency** | Low for structured index joins. | Sub-millisecond lookup on distributed nodes. |

### Schema Implementation Recommendation

For **Criminal Booking Records**, implement a relational schema to prevent key collisions:
\`\`\`sql
CREATE TABLE Arkham_Registry (
    inmate_id VARCHAR(50) PRIMARY KEY,
    alias VARCHAR(100) NOT NULL,
    threat_level VARCHAR(10) CHECK (threat_level IN ('LOW', 'MED', 'HIGH', 'MAX')),
    incarceration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
\`\`\`

For **Real-time Batarang Telemetry**, utilize a NoSQL structure (e.g. JSON document):
\`\`\`json
{
  "device_id": "BATARANG-X2",
  "active_coordinates": { "lat": 40.730610, "lon": -73.935242 },
  "sensor_readings": { "velocity_mps": 45.2, "kinetic_impact_n": 120 },
  "payload_deploy": "ELECTRO_SHOCK"
}
\`\`\`

*Uplink secure. Use SQL for structured, unyielding databases. Use NoSQL when flexibility and horizontal scale are critical.*`;

    } else if (lowercasePrompt.includes("gadget") || lowercasePrompt.includes("search") || lowercasePrompt.includes("rescue") || lowercasePrompt.includes("brainstorm")) {
      thinkingSteps.push("Accessing Wayne Enterprises R&D Vault...", "Filtering search rescue patents...");
      responseText = `I have retrieved **5 tactical gadget designs** engineered for search and rescue operations in dark or hostile territories:

1. **Sonar Cowl Link (Active Echolocation)**
   * **Mechanism**: Integrated micro-transceivers inside a helmet scan the surroundings via high-frequency sonic pulses. The receiver constructs a real-time 3D wireframe layout projected onto a HUD, allowing navigation through thick smoke or zero-light obstacles.
   
2. **Grapple-Mounted Micro-Drones**
   * **Mechanism**: Deployable micro-recon drones launched from a tactical grapple harness. They autonomously map tight vents, elevator shafts, or sewer paths, returning structural scans before personnel entry.
   
3. **Benthic Thermal Injector**
   * **Mechanism**: A modular hand-held torch that emits localized thermal beams to slice through collapsed steel plates while releasing cooling agents to prevent combustion in oxygen-scarce pockets.
   
4. **Bio-Telemetry Tracer Dart**
   * **Mechanism**: Compressed pneumatic launchers fire micro-dermal patches that adhere to target clothing, streaming heart-rate indicators, temperature logs, and active coordinates back to the Batcomputer.
   
5. **Glow-Path Pellet Disperser**
   * **Mechanism**: Miniature spheres filled with biodegradable luminescent chemistry. When dropped, they form a glowing trail path visible through night-vision lenses, highlighting exit routes.`;

    } else if (lowercasePrompt.includes("signal") || lowercasePrompt.includes("animation") || lowercasePrompt.includes("css") || lowercasePrompt.includes("neon")) {
      thinkingSteps.push("Compiling CSS keyframes...", "Calibrating neon luminescence filters...");
      responseText = `Below is the CSS layout code to project an active glowing **neon Bat-Signal** panel on the web interface.

### HTML Structure
\`\`\`html
<div class="bat-signal-card">
  <div class="signal-glow"></div>
  <h3>Signal Active</h3>
  <p>The sky is dark. The signal is online.</p>
</div>
\`\`\`

### Stylesheet (CSS)
\`\`\`css
:root {
  --neon-signal: #ffcc00;
  --signal-bg: rgba(6, 6, 9, 0.9);
  --signal-border: rgba(255, 204, 0, 0.2);
}

.bat-signal-card {
  position: relative;
  padding: 2.5rem;
  border-radius: 20px;
  background: var(--signal-bg);
  border: 1px solid var(--signal-border);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
  overflow: hidden;
  text-align: center;
}

/* Glowing Aura Indicator */
.signal-glow {
  position: absolute;
  top: -50px;
  left: 50%;
  transform: translateX(-50%);
  width: 150px;
  height: 150px;
  background: var(--neon-signal);
  filter: blur(80px);
  opacity: 0.3;
  pointer-events: none;
  animation: batSignalPulse 4s infinite alternate ease-in-out;
}

/* Neon Bat-Signal Flicker Keyframe */
@keyframes batSignalPulse {
  0% {
    opacity: 0.2;
    transform: translateX(-50%) scale(1);
  }
  100% {
    opacity: 0.55;
    transform: translateX(-50%) scale(1.15);
  }
}

.bat-signal-card h3 {
  color: var(--neon-signal);
  text-shadow: 0 0 10px rgba(255, 204, 0, 0.6);
  font-family: 'Outfit', sans-serif;
  margin-bottom: 0.5rem;
}
\`\`\`

This combines blurred glowing centers and a scale animation to mimic a spotlight reflection.`;

    } else {
      thinkingSteps.push("Filtering queries...", "Establishing connection fallback...");
      responseText = `I am **Botman**, the dark knight of AI assistants. 

I am currently running in **Offline Mode** (Simulated). Connect this node directly to live **Gemini API** instances by selecting the **Batcomputer Link** at the bottom-left, pasting your API key, and saving configurations.

### Database Query Codes
Initiate search logs with these keyword queries:
- **Scan Gotham harbor** (surveillance scraper script)
- **Compare security database** (SQL Relational booking vs NoSQL telemetry)
- **Tactical gadget brainstorm** (Wayne R&D search & rescue tools)
- **Bat-Signal neon CSS** (neon glow spotlights animations)

*Stand watch. What is your command?*`;
    }

    // Stream the thinking steps
    let thinkingAccumulator = "";
    for (let i = 0; i < thinkingSteps.length; i++) {
      if (signal?.aborted) {
        onChunk("\n\n*[Uplink transmission terminated by user]*");
        return;
      }
      thinkingAccumulator += (i > 0 ? "\n" : "") + "▸ " + thinkingSteps[i];
      onThinking(thinkingAccumulator);
      await new Promise(resolve => setTimeout(resolve, 350 + Math.random() * 200));
    }

    thinkingAccumulator += "\n✔ Uplink active. Stream initiation authorized.";
    onThinking(thinkingAccumulator);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Stream response chunks (word-by-word)
    const words = responseText.split(" ");
    
    for (const word of words) {
      if (signal?.aborted) {
        onChunk("\n\n*[Uplink transmission terminated by user]*");
        return;
      }
      onChunk(word + " ");
      await new Promise(resolve => setTimeout(resolve, 40 + Math.random() * 30));
    }
  }
};

window.API_SERVICE = API_SERVICE;
