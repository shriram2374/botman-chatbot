/**
 * Radiant Chat — UI Application Controller
 * Handles conversation state, local storage synchronization, streaming UI, and user interactions.
 */

// Global state variables
let chats = [];
let activeChatId = null;
let apiConfig = {
  apiKey: "",
  temperature: 0.7
};
let abortController = null;

// HTML Elements Cache
const chatsListEl = document.getElementById("chats-list");
const chatTitleEl = document.getElementById("chat-title");
const modelSelectorEl = document.getElementById("model-selector");
const statusIndicatorEl = document.getElementById("status-indicator");
const statusTextEl = document.getElementById("status-text");
const messagesContainerEl = document.getElementById("messages-container");
const welcomeScreenEl = document.getElementById("welcome-screen");
const chatInputEl = document.getElementById("chat-input");
const charCounterEl = document.getElementById("char-counter");
const sendBtnEl = document.getElementById("send-btn");
const stopBtnEl = document.getElementById("stop-btn");
const sidebarEl = document.getElementById("sidebar");
const menuToggleBtnEl = document.getElementById("menu-toggle-btn");
const newChatBtnEl = document.getElementById("new-chat-btn");
const navNewChatBtnEl = document.getElementById("nav-new-chat-btn");
const clearChatsBtnEl = document.getElementById("clear-chats-btn");

// Modals
const settingsModalEl = document.getElementById("settings-modal");
const settingsBtnEl = document.getElementById("settings-btn");
const closeModalBtnEl = document.getElementById("close-modal-btn");
const cancelSettingsBtnEl = document.getElementById("cancel-settings-btn");
const saveSettingsBtnEl = document.getElementById("save-settings-btn");
const apiKeyInputEl = document.getElementById("api-key-input");
const tempInputEl = document.getElementById("temperature-input");
const tempValEl = document.getElementById("temp-val");
const togglePasswordBtnEl = document.getElementById("toggle-password-btn");

/* ----------------------------------------------------
   Initialization & Storage Management
   ---------------------------------------------------- */

function initApp() {
  // Load configuration from local storage
  const savedConfig = localStorage.getItem("radiant_api_config");
  if (savedConfig) {
    apiConfig = JSON.parse(savedConfig);
    apiKeyInputEl.value = apiConfig.apiKey || "";
    tempInputEl.value = apiConfig.temperature ?? 0.7;
    tempValEl.textContent = apiConfig.temperature ?? 0.7;
  }

  // Load chat history
  const savedChats = localStorage.getItem("radiant_chats");
  const savedActiveChatId = localStorage.getItem("radiant_active_chat_id");

  if (savedChats) {
    chats = JSON.parse(savedChats);
  }

  if (chats.length === 0) {
    createNewChat();
  } else {
    // Validate saved active chat ID
    const exists = chats.some(c => c.id === savedActiveChatId);
    activeChatId = exists ? savedActiveChatId : chats[0].id;
    renderChatsList();
    loadChat(activeChatId);
  }

  setupEventListeners();
}

function saveState() {
  localStorage.setItem("radiant_chats", JSON.stringify(chats));
  localStorage.setItem("radiant_active_chat_id", activeChatId);
}

/* ----------------------------------------------------
   Chat State Operations
   ---------------------------------------------------- */

function createNewChat() {
  const newChat = {
    id: "chat_" + Date.now(),
    title: "New Mission",
    model: modelSelectorEl.value,
    messages: []
  };
  chats.unshift(newChat);
  activeChatId = newChat.id;
  saveState();
  renderChatsList();
  loadChat(activeChatId);
}

function loadChat(chatId) {
  activeChatId = chatId;
  const chat = chats.find(c => c.id === chatId);
  if (!chat) return;

  // Sync model selector
  modelSelectorEl.value = chat.model;
  chatTitleEl.textContent = chat.title;

  // Clear current messages view
  messagesContainerEl.innerHTML = "";

  if (chat.messages.length === 0) {
    welcomeScreenEl.classList.remove("hidden");
  } else {
    welcomeScreenEl.classList.add("hidden");
    chat.messages.forEach(msg => {
      appendMessageToDOM(msg.role, msg.content, msg.thinking);
    });
    scrollToBottom();
  }

  // Highlight active chat
  document.querySelectorAll(".chat-item").forEach(item => {
    if (item.dataset.id === chatId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Close sidebar on mobile after choosing chat
  sidebarEl.classList.remove("active");
}

function deleteChat(chatId, event) {
  event.stopPropagation(); // Avoid triggering loadChat
  
  chats = chats.filter(c => c.id !== chatId);
  
  if (chats.length === 0) {
    createNewChat();
  } else {
    if (activeChatId === chatId) {
      activeChatId = chats[0].id;
    }
    saveState();
    renderChatsList();
    loadChat(activeChatId);
  }
}

function clearAllChats() {
  if (confirm("Are you sure you want to delete all chat conversations? This cannot be undone.")) {
    chats = [];
    createNewChat();
  }
}

/* ----------------------------------------------------
   Rendering & Formatting Utilities
   ---------------------------------------------------- */

function renderChatsList() {
  chatsListEl.innerHTML = "";
  chats.forEach(chat => {
    const item = document.createElement("div");
    item.className = `chat-item ${chat.id === activeChatId ? "active" : ""}`;
    item.dataset.id = chat.id;
    
    // Setup item inner layout
    item.innerHTML = `
      <div class="chat-item-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span class="chat-item-title">${escapeHTML(chat.title)}</span>
      </div>
      <div class="chat-item-actions">
        <button class="chat-action-btn" title="Delete conversation">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    item.addEventListener("click", () => loadChat(chat.id));
    
    const deleteBtn = item.querySelector(".chat-action-btn");
    deleteBtn.addEventListener("click", (e) => deleteChat(chat.id, e));

    chatsListEl.appendChild(item);
  });
}

function appendMessageToDOM(role, content, thinkingText = "") {
  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "user" : "ai"}`;

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper";

  // Avatar Icon
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  
  if (role === "user") {
    avatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
  } else {
    avatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
  }

  // Message bubble
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  // Create collapsible thinking block if thinking step present
  if (thinkingText && role === "assistant") {
    const reasoningEl = document.createElement("div");
    reasoningEl.className = "reasoning-container collapsed";
    
    reasoningEl.innerHTML = `
      <div class="reasoning-header">
        <span>Reasoning Process</span>
        <svg class="reasoning-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="reasoning-content">${escapeHTML(thinkingText)}</div>
    `;

    reasoningEl.querySelector(".reasoning-header").addEventListener("click", () => {
      reasoningEl.classList.toggle("collapsed");
    });
    wrapper.appendChild(reasoningEl);
  }

  // Format content using markdown utility
  bubble.innerHTML = parseMarkdown(content);

  wrapper.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(wrapper);
  messagesContainerEl.appendChild(row);
  return { row, bubble, wrapper };
}

function parseMarkdown(text) {
  if (!text) return "";
  
  // Custom Markdown parser supporting code blocks, bold elements, headers, list structures
  const parts = text.split(/```/g);
  let html = "";
  
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      // Inside code block
      const block = parts[i];
      const newlineIndex = block.indexOf("\n");
      let lang = "code";
      let code = block;
      
      if (newlineIndex !== -1) {
        lang = block.substring(0, newlineIndex).trim() || "code";
        code = block.substring(newlineIndex + 1);
      }
      
      const escapedCode = escapeHTML(code.trim());
      html += `
        <div class="code-container" style="margin: 1rem 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-glass);">
          <div class="code-header">
            <span>${lang}</span>
            <button class="copy-code-btn" onclick="copyCode(this)">Copy</button>
          </div>
          <pre style="background: #06060c; overflow-x: auto; padding: 1rem;"><code class="language-${lang}" style="background: transparent; font-family: var(--font-mono); font-size: 0.85rem; color: #e5e7eb; display: block; white-space: pre;">${escapedCode}</code></pre>
        </div>
      `;
    } else {
      // Normal Text paragraph parsing
      let textSection = parts[i];
      if (!textSection) continue;
      
      let escaped = escapeHTML(textSection);

      // Inline code blocks: `code`
      escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

      // Bold text: **text**
      escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      // Unordered lists: lines starting with "*" or "-"
      const lines = escaped.split("\n");
      let inList = false;
      const parsedLines = [];

      for (let line of lines) {
        const trimmed = line.trim();
        const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
        
        if (listMatch) {
          if (!inList) {
            parsedLines.push("<ul>");
            inList = true;
          }
          parsedLines.push(`<li>${listMatch[1]}</li>`);
        } else {
          if (inList) {
            parsedLines.push("</ul>");
            inList = false;
          }
          parsedLines.push(line);
        }
      }
      
      if (inList) {
        parsedLines.push("</ul>");
      }

      // Convert normal lines to paragraph structures
      html += parsedLines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("<ul>") || trimmed.startsWith("</ul>") || trimmed.startsWith("<li>")) {
          return line;
        }
        return trimmed ? `<p style="margin-bottom: 0.75rem;">${line}</p>` : "";
      }).join("");
    }
  }
  
  return html;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function scrollToBottom() {
  messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
}

// Bind to window to allow button onclicks from parsed HTML
window.copyCode = function(button) {
  const codeContainer = button.closest("div").nextElementSibling.querySelector("code");
  if (!codeContainer) return;
  
  navigator.clipboard.writeText(codeContainer.textContent).then(() => {
    button.textContent = "Copied!";
    button.style.borderColor = "var(--accent-green)";
    button.style.color = "var(--accent-green)";
    
    setTimeout(() => {
      button.textContent = "Copy";
      button.style.borderColor = "var(--border-glass)";
      button.style.color = "var(--text-secondary)";
    }, 2000);
  }).catch(err => {
    console.error("Clipboard copy failed:", err);
  });
};

/* ----------------------------------------------------
   Conversation Workflow & Stream Execution
   ---------------------------------------------------- */

async function handleSendMessage() {
  const prompt = chatInputEl.value.trim();
  if (!prompt) return;

  const chat = chats.find(c => c.id === activeChatId);
  if (!chat) return;

  // Clear input box
  chatInputEl.value = "";
  chatInputEl.style.height = "auto";
  charCounterEl.textContent = "0 / 4000";
  sendBtnEl.disabled = true;
  welcomeScreenEl.classList.add("hidden");

  // Push User message
  const userMessage = { role: "user", content: prompt };
  chat.messages.push(userMessage);

  // Set chat title if it's the first message
  if (chat.title === "New Mission" && chat.messages.length === 1) {
    chat.title = prompt.length > 24 ? prompt.substring(0, 24) + "..." : prompt;
    renderChatsList();
    chatTitleEl.textContent = chat.title;
  }

  saveState();
  appendMessageToDOM("user", prompt);
  scrollToBottom();

  // Show status active loading
  statusIndicatorEl.className = "status-indicator working";
  statusTextEl.textContent = "Responding...";
  stopBtnEl.classList.remove("hidden");

  // Create active streaming row for assistant
  const { bubble, wrapper } = appendMessageToDOM("assistant", "");
  bubble.classList.add("streaming-cursor");
  scrollToBottom();

  let accumulatedContent = "";
  let accumulatedThinking = "";
  let reasoningEl = null;

  // Instantiate abort handle
  abortController = new AbortController();

  try {
    await window.API_SERVICE.generateResponse(
      chat.model,
      prompt,
      chat.messages.slice(0, -1), // Send previous messages
      apiConfig,
      // onChunk handler
      (chunk) => {
        accumulatedContent += chunk;
        bubble.innerHTML = parseMarkdown(accumulatedContent);
        scrollToBottom();
      },
      // onThinking handler
      (thinkingChunk) => {
        accumulatedThinking = thinkingChunk;
        
        if (!reasoningEl) {
          reasoningEl = document.createElement("div");
          reasoningEl.className = "reasoning-container";
          reasoningEl.innerHTML = `
            <div class="reasoning-header">
              <span>Thinking Process</span>
              <svg class="reasoning-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
            <div class="reasoning-content"></div>
          `;
          
          reasoningEl.querySelector(".reasoning-header").addEventListener("click", () => {
            reasoningEl.classList.toggle("collapsed");
          });
          
          // Insert reasoning block before the text bubble inside wrapper
          wrapper.insertBefore(reasoningEl, bubble);
        }
        
        reasoningEl.querySelector(".reasoning-content").textContent = accumulatedThinking;
        scrollToBottom();
      },
      abortController.signal
    );

    // Save final response payload
    chat.messages.push({
      role: "assistant",
      content: accumulatedContent,
      thinking: accumulatedThinking
    });
    saveState();

  } catch (error) {
    console.error("API invocation error:", error);
    accumulatedContent += `\n\n*(Error encountered: ${error.message})*`;
    bubble.innerHTML = parseMarkdown(accumulatedContent);
    chat.messages.push({
      role: "assistant",
      content: accumulatedContent,
      thinking: accumulatedThinking
    });
    saveState();
  } finally {
    // Remove streaming animation
    bubble.classList.remove("streaming-cursor");
    statusIndicatorEl.className = "status-indicator ready";
    statusTextEl.textContent = "Ready";
    stopBtnEl.classList.add("hidden");
    abortController = null;
    scrollToBottom();
  }
}

function handleStopGeneration() {
  if (abortController) {
    abortController.abort();
  }
}

/* ----------------------------------------------------
   Event Listeners & Setup
   ---------------------------------------------------- */

function setupEventListeners() {
  
  // Submit actions
  sendBtnEl.addEventListener("click", handleSendMessage);
  stopBtnEl.addEventListener("click", handleStopGeneration);

  // Input textarea behavior (dynamic height resize)
  chatInputEl.addEventListener("input", () => {
    chatInputEl.style.height = "auto";
    chatInputEl.style.height = (chatInputEl.scrollHeight) + "px";
    
    const count = chatInputEl.value.length;
    charCounterEl.textContent = `${count} / 4000`;
    sendBtnEl.disabled = count === 0;
  });

  chatInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtnEl.disabled) {
        handleSendMessage();
      }
    }
  });

  // Model change behavior
  modelSelectorEl.addEventListener("change", () => {
    const chat = chats.find(c => c.id === activeChatId);
    if (chat) {
      chat.model = modelSelectorEl.value;
      saveState();
    }
  });

  // Suggestion chips interactions
  document.querySelectorAll(".suggestion-card").forEach(card => {
    card.addEventListener("click", () => {
      chatInputEl.value = card.dataset.prompt;
      chatInputEl.style.height = "auto";
      chatInputEl.style.height = (chatInputEl.scrollHeight) + "px";
      charCounterEl.textContent = `${chatInputEl.value.length} / 4000`;
      sendBtnEl.disabled = false;
      chatInputEl.focus();
    });
  });

  // Sidebar controls
  newChatBtnEl.addEventListener("click", createNewChat);
  navNewChatBtnEl.addEventListener("click", createNewChat);
  clearChatsBtnEl.addEventListener("click", clearAllChats);
  menuToggleBtnEl.addEventListener("click", () => {
    sidebarEl.classList.toggle("active");
  });

  // Modal event controls
  settingsBtnEl.addEventListener("click", () => {
    settingsModalEl.classList.add("active");
  });

  const closeModal = () => {
    settingsModalEl.classList.remove("active");
    // Reset fields to match actual state
    apiKeyInputEl.value = apiConfig.apiKey || "";
    tempInputEl.value = apiConfig.temperature ?? 0.7;
    tempValEl.textContent = apiConfig.temperature ?? 0.7;
  };

  closeModalBtnEl.addEventListener("click", closeModal);
  cancelSettingsBtnEl.addEventListener("click", closeModal);

  // Settings Temperature slider interaction
  tempInputEl.addEventListener("input", (e) => {
    tempValEl.textContent = e.target.value;
  });

  // Password hide/reveal
  togglePasswordBtnEl.addEventListener("click", () => {
    if (apiKeyInputEl.type === "password") {
      apiKeyInputEl.type = "text";
      togglePasswordBtnEl.textContent = "Hide";
    } else {
      apiKeyInputEl.type = "password";
      togglePasswordBtnEl.textContent = "Show";
    }
  });

  // Modal Settings Submit Action
  saveSettingsBtnEl.addEventListener("click", () => {
    apiConfig.apiKey = apiKeyInputEl.value.trim();
    apiConfig.temperature = parseFloat(tempInputEl.value);
    
    localStorage.setItem("radiant_api_config", JSON.stringify(apiConfig));
    alert("Settings updated successfully! Ready for AI requests.");
    
    settingsModalEl.classList.remove("active");
  });
}

// Launch App On Page Load
document.addEventListener("DOMContentLoaded", initApp);
