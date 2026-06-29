import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function Dashboard({ session, onSignOut }) {
  // Application State
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarActive, setSidebarActive] = useState(false);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [settingsActive, setSettingsActive] = useState(false);
  const [temperature, setTemperature] = useState(0.7);

  // Streaming State (For real-time UI accumulation)
  const [streamContent, setStreamContent] = useState('');
  const [streamThinking, setStreamThinking] = useState('');

  // Refs for DOM management
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);

  const currentUser = session?.user;
  const username = currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'Agent';

  // ----------------------------------------------------
  // Database Synchronization Operations
  // ----------------------------------------------------

  const fetchChats = async () => {
    try {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setChats(data || []);
      return data || [];
    } catch (err) {
      console.error("Error fetching chats:", err);
    }
  };

  const fetchMessages = async (chatId) => {
    if (!chatId) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  };

  // On mount: Fetch chats list and auto-select
  useEffect(() => {
    const initChats = async () => {
      const chatList = await fetchChats();
      if (chatList && chatList.length > 0) {
        // Load the first chat
        setActiveChatId(chatList[0].id);
      } else {
        // Create initial chat
        await handleCreateChat();
      }
    };
    initChats();
  }, []);

  // Whenever active chat changes: Load its messages
  useEffect(() => {
    if (activeChatId) {
      fetchMessages(activeChatId);
      // Sync model select configuration
      const activeChat = chats.find(c => c.id === activeChatId);
      if (activeChat) {
        setModel(activeChat.model || 'gemini-2.5-flash');
      }
    } else {
      setMessages([]);
    }
    setStreamContent('');
    setStreamThinking('');
  }, [activeChatId]);

  // Auto scroll to bottom when messages or active streams update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent, streamThinking]);

  // Dynamic textarea height resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputText]);

  // ----------------------------------------------------
  // Chat Actions
  // ----------------------------------------------------

  const handleCreateChat = async () => {
    try {
      const newChat = {
        user_id: currentUser.id,
        title: 'New Mission',
        model: model,
      };

      const { data, error } = await supabase
        .from('chats')
        .insert([newChat])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const createdChat = data[0];
        setChats(prev => [createdChat, ...prev]);
        setActiveChatId(createdChat.id);
      }
    } catch (err) {
      console.error("Error creating chat:", err);
    }
  };

  const handleDeleteChat = async (chatId, e) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId);

      if (error) throw error;

      const remainingChats = chats.filter(c => c.id !== chatId);
      setChats(remainingChats);

      if (activeChatId === chatId) {
        if (remainingChats.length > 0) {
          setActiveChatId(remainingChats[0].id);
        } else {
          setActiveChatId(null);
          // Auto create a new empty chat
          await handleCreateChat();
        }
      }
    } catch (err) {
      console.error("Error deleting chat:", err);
    }
  };

  const handleClearAllChats = async () => {
    if (!confirm("Are you sure you want to purge all mission logs from the cloud? This cannot be undone.")) return;
    try {
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('user_id', currentUser.id);

      if (error) throw error;

      setChats([]);
      setActiveChatId(null);
      await handleCreateChat();
    } catch (err) {
      console.error("Error purging chats:", err);
    }
  };

  const handleModelChange = async (e) => {
    const selectedModel = e.target.value;
    setModel(selectedModel);

    if (activeChatId) {
      try {
        const { error } = await supabase
          .from('chats')
          .update({ model: selectedModel })
          .eq('id', activeChatId);

        if (error) throw error;
        setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, model: selectedModel } : c));
      } catch (err) {
        console.error("Error updating model config:", err);
      }
    }
  };

  const handleSendMessage = async (promptText = null) => {
    const textToSend = (promptText || inputText).trim();
    if (!textToSend || !activeChatId || isGenerating) return;

    setInputText('');
    setIsGenerating(true);
    setStreamContent('');
    setStreamThinking('');

    // Abort controller for cancellation hooks
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Get current chat details
    const activeChat = chats.find(c => c.id === activeChatId);
    const chatModel = activeChat?.model || model;

    // Local snapshot of historical messages
    const currentMessages = [...messages];

    // 1. Insert User Message into Cloud Database
    const userMsgData = {
      chat_id: activeChatId,
      role: 'user',
      content: textToSend
    };

    try {
      const { data: userMsg, error: userMsgErr } = await supabase
        .from('messages')
        .insert([userMsgData])
        .select();

      if (userMsgErr) throw userMsgErr;
      
      // Update UI state instantly with new user bubble
      setMessages(prev => [...prev, userMsg[0]]);

      // Auto rename chat title if it's the first message
      const isFirstMessage = currentMessages.length === 0;
      let newTitle = activeChat?.title;
      if (isFirstMessage) {
        newTitle = textToSend.length > 24 ? textToSend.substring(0, 24) + '...' : textToSend;
        await supabase
          .from('chats')
          .update({ title: newTitle })
          .eq('id', activeChatId);

        setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, title: newTitle } : c));
      }

      // 2. Trigger Server-Side Streaming API Route
      const requestMessages = [
        ...currentMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: textToSend }
      ];

      // Prepare simulated thinking logs before streaming live answers (if mock core selected)
      let simulated = chatModel.endsWith('-sim');
      if (simulated) {
        // Trigger simulated responder local delay steps
        const thinkingSteps = [
          "Accessing Batcomputer database...",
          "Decrypting regional security feeds...",
          "Synthesizing response protocols...",
          "Routing signal via Wayne Enterprises satellites...",
          "Uplink active. Stream initiation authorized."
        ];
        
        let accumThinking = "";
        for (let i = 0; i < thinkingSteps.length; i++) {
          if (controller.signal.aborted) throw new Error("Stopped");
          accumThinking += (i > 0 ? "\n" : "") + "▸ " + thinkingSteps[i];
          setStreamThinking(accumThinking);
          await new Promise(r => setTimeout(r, 400));
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: chatModel,
          messages: requestMessages,
          temperature: temperature
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `API status code ${response.status}`);
      }

      // Read Web Readable Stream from backend
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumContent = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        accumContent += chunkText;
        setStreamContent(accumContent);
      }

      // 3. Save Assistant Message (and accumulated stream payload) to Cloud Database
      const assistantMsgData = {
        chat_id: activeChatId,
        role: 'assistant',
        content: accumContent,
        thinking: simulated ? "Decryption steps complete. Output generated." : null
      };

      const { data: aiMsg, error: aiMsgErr } = await supabase
        .from('messages')
        .insert([assistantMsgData])
        .select();

      if (aiMsgErr) throw aiMsgErr;
      
      // Merge final response into react state lists
      setMessages(prev => [...prev, aiMsg[0]]);

    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Stopped') {
        const cancelMsg = "\n\n*[Uplink transmission terminated by user]*";
        setStreamContent(prev => prev + cancelMsg);
        
        // Write stopped content to DB
        const assistantMsgData = {
          chat_id: activeChatId,
          role: 'assistant',
          content: (streamContent || '') + cancelMsg,
          thinking: streamThinking || null
        };
        const { data: aiMsg } = await supabase.from('messages').insert([assistantMsgData]).select();
        if (aiMsg && aiMsg.length > 0) {
          setMessages(prev => [...prev, aiMsg[0]]);
        }
      } else {
        console.error("Transmission error:", err);
        const errMsgText = `\n\n*(Error encountered: ${err.message})*`;
        setStreamContent(prev => prev + errMsgText);
        
        const assistantMsgData = {
          chat_id: activeChatId,
          role: 'assistant',
          content: (streamContent || '') + errMsgText,
          thinking: streamThinking || null
        };
        const { data: aiMsg } = await supabase.from('messages').insert([assistantMsgData]).select();
        if (aiMsg && aiMsg.length > 0) {
          setMessages(prev => [...prev, aiMsg[0]]);
        }
      }
    } finally {
      setIsGenerating(false);
      setStreamContent('');
      setStreamThinking('');
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // ----------------------------------------------------
  // Markdown & Code Copying Renderers
  // ----------------------------------------------------

  const copyToClipboard = (text, e) => {
    const btn = e.target;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "Copied!";
      btn.style.borderColor = "var(--accent-green)";
      btn.style.color = "var(--accent-green)";
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.style.borderColor = "var(--border-glass)";
        btn.style.color = "var(--text-secondary)";
      }, 2000);
    });
  };

  const renderFormattedMarkdown = (text) => {
    if (!text) return "";
    const parts = text.split(/```/g);
    
    return parts.map((part, idx) => {
      if (idx % 2 === 1) {
        // Inside Code Block
        const block = part;
        const newlineIdx = block.indexOf("\n");
        let lang = "code";
        let code = block;
        
        if (newlineIdx !== -1) {
          lang = block.substring(0, newlineIdx).trim() || "code";
          code = block.substring(newlineIdx + 1);
        }

        return (
          <div key={idx} className="code-container" style={{ margin: '1rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
            <div className="code-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-glass)' }}>
              <span>{lang}</span>
              <button className="copy-code-btn" onClick={(e) => copyToClipboard(code.trim(), e)}>Copy</button>
            </div>
            <pre style={{ background: '#040406', overflowX: 'auto', padding: '1rem', margin: 0 }}>
              <code className={`language-${lang}`} style={{ background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#e5e7eb', display: 'block', whiteSpace: 'pre' }}>
                {code.trim()}
              </code>
            </pre>
          </div>
        );
      } else {
        // Normal text block
        const paragraphs = part.split('\n');
        let inList = false;
        let listItems = [];
        
        return paragraphs.map((line, lineIdx) => {
          const trimmed = line.trim();
          const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
          
          if (listMatch) {
            inList = true;
            listItems.push(listMatch[1]);
            
            // Check if next line is not a list item to render the full list
            const nextLine = paragraphs[lineIdx + 1]?.trim() || '';
            const nextIsList = nextLine.startsWith('-') || nextLine.startsWith('*');
            
            if (!nextIsList) {
              const currentList = [...listItems];
              listItems = [];
              inList = false;
              return (
                <ul key={`${idx}-${lineIdx}`} style={{ marginLeft: '1.5rem', marginBottom: '0.75rem' }}>
                  {currentList.map((item, itemIdx) => (
                    <li key={itemIdx} style={{ marginBottom: '0.25rem' }}>{item}</li>
                  ))}
                </ul>
              );
            }
            return null;
          }

          if (inList) return null;
          
          // Simple bold **text** replacement
          // React element splitting is safer than dangerousInnerHtml for bold nodes
          const boldParts = line.split(/\*\*([^*]+)\*\*/g);
          const hasBold = boldParts.length > 1;

          const renderLineContent = () => {
            if (!hasBold) return line;
            return boldParts.map((subPart, bIdx) => (
              bIdx % 2 === 1 ? <strong key={bIdx} style={{ color: '#fff', fontWeight: 600 }}>{subPart}</strong> : subPart
            ));
          };

          return trimmed ? (
            <p key={`${idx}-${lineIdx}`} style={{ marginBottom: '0.75rem' }}>
              {renderLineContent()}
            </p>
          ) : null;
        });
      }
    });
  };

  const handleSuggestionClick = (prompt) => {
    setInputText(prompt);
    handleSendMessage(prompt);
  };

  return (
    <div className="app-container" id="app-container">
      
      {/* Sidebar navigation */}
      <aside className={`sidebar ${sidebarActive ? 'active' : ''}`} id="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <svg class="sparkle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12,7.5c-0.5,0-0.9-0.4-1.2-0.8c-0.7-1.1-1.5-2.2-2.3-3.2c-0.1-0.2-0.3-0.2-0.5-0.1c-0.2,0.1-0.2,0.3-0.1,0.5c0.7,1.4,1,2.8,1,4.4c0,0.4-0.1,0.7-0.4,1c-1.8,1.8-4.2,2.5-6.7,2.2c-0.3,0-0.6,0.2-0.7,0.5c-0.1,0.3,0.1,0.6,0.3,0.7c2.5,1.2,4.8,2.7,6.7,4.8c0.2,0.2,0.4,0.3,0.7,0.3c0.7,0.1,1.1,0.7,1.5,1.2c0.7,1,1.5,1.9,2.4,2.7c0.2,0.2,0.5,0.2,0.7,0c0.9-0.8,1.7-1.7,2.4-2.7c0.4-0.5,0.8-1.1,1.5-1.2c0.3,0,0.5-0.1,0.7-0.3c1.9-2.1,4.2-3.6,6.7-4.8c0.2-0.1,0.4-0.4,0.3-0.7c-0.1-0.3-0.4-0.5-0.7-0.5c-2.5,0.3-4.9-0.4-6.7-2.2c-0.3-0.3-0.4-0.6-0.4-1c0-1.6,0.3-3,1-4.4c0.1-0.2,0-0.4-0.1-0.5c-0.2-0.1-0.4-0.1-0.5,0.1c-0.8,1-1.6,2.1-2.3,3.2C12.9,7.1,12.5,7.5,12,7.5z" fill="url(#gradient-accent-sidebar)"/>
              <defs>
                <linearGradient id="gradient-accent-sidebar" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#ffe600"/>
                  <stop offset="1" stop-color="#b58500"/>
                </linearGradient>
              </defs>
            </svg>
            <span>BOTMAN</span>
          </div>
          <button className="new-chat-btn" onClick={handleCreateChat} title="Start new mission">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>New Mission</span>
          </button>
        </div>

        <nav class="history-panel" id="history-panel">
          <div class="section-title">Mission Logs</div>
          <div class="chats-list" id="chats-list">
            {chats.map(chat => (
              <div
                key={chat.id}
                className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                onClick={() => setActiveChatId(chat.id)}
              >
                <div class="chat-item-left">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span class="chat-item-title">{chat.title}</span>
                </div>
                <div class="chat-item-actions">
                  <button className="chat-action-btn" title="Delete conversation" onClick={(e) => handleDeleteChat(chat.id, e)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div class="sidebar-footer">
          <div style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', color: 'var(--accent-yellow)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>👤 {username}</span>
            <span style={{ cursor: 'pointer', opacity: 0.8 }} onClick={onSignOut} title="Sign Out">Sign Out 🚪</span>
          </div>
          <button class="footer-action-btn" id="settings-btn" onClick={() => setSettingsActive(true)} title="Batcomputer Parameters">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span>Batcomputer Settings</span>
          </button>
          <button class="footer-action-btn delete-btn" id="clear-chats-btn" onClick={handleClearAllChats} title="Purge database logs">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            <span>Purge Logs</span>
          </button>
        </div>
      </aside>

      {/* Main workspace */}
      <main class="chat-workspace">
        
        <header class="navbar">
          <div class="nav-left">
            <button class="menu-toggle-btn" onClick={() => setSidebarActive(!sidebarActive)} aria-label="Toggle Sidebar">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div class="chat-title" id="chat-title">
              {chats.find(c => c.id === activeChatId)?.title || 'New Mission'}
            </div>
          </div>

          <div class="nav-right">
            <div class="model-select-wrapper">
              <select class="model-selector" value={model} onChange={handleModelChange}>
                <option value="gemini-2.5-flash">Batcomputer Core (Flash)</option>
                <option value="gemini-2.5-pro">Batcomputer Core (Pro)</option>
                <option value="gemini-1.5-flash">Batcomputer Core (Legacy)</option>
                <option value="claude-3-5-sonnet-sim">Alfred-3.5 (Simulated)</option>
                <option value="gpt-4o-sim">Oracle-4o (Simulated)</option>
              </select>
            </div>
            <div class={`status-indicator ${isGenerating ? 'working' : 'ready'}`}>
              <span class="pulse-dot"></span>
              <span class="status-text">{isGenerating ? 'Processing...' : 'Online'}</span>
            </div>
            {/* Quick-action New Chat Shortcut for Mobile */}
            <button className="nav-new-chat-btn" onClick={handleCreateChat} title="Start new mission">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </header>

        {/* Message Container Area */}
        <div class="messages-container" id="messages-container">
          
          {messages.length === 0 && !streamContent && !streamThinking && (
            <div class="welcome-screen" id="welcome-screen">
              <div class="welcome-header">
                <h1 class="gradient-text">I am Botman. I stand watch.</h1>
                <p class="subtitle">Secure cloud uplink active. How can I assist you with your mission tonight?</p>
              </div>

              <div class="suggestion-grid">
                <button class="suggestion-card" onClick={() => handleSuggestionClick("Help me write a Python script to scan the Gotham harbor surveillance cameras.")}>
                  <span class="card-icon">🦇</span>
                  <span class="card-title">Scan Gotham harbor</span>
                  <span class="card-description">Write surveillance python script</span>
                </button>
                <button class="suggestion-card" onClick={() => handleSuggestionClick("Compare Batcomputer security database schemas: SQL relational integrity vs NoSQL decentralization.")}>
                  <span class="card-icon">🛡️</span>
                  <span class="card-title">Compare security schemas</span>
                  <span class="card-description">SQL vs NoSQL integrity check</span>
                </button>
                <button class="suggestion-card" onClick={() => handleSuggestionClick("Brainstorm 5 tactical gadget ideas to assist search and rescue teams in dark locations.")}>
                  <span class="card-icon">⚡</span>
                  <span class="card-title">Tactical Gadget Ideas</span>
                  <span class="card-description">Brainstorming search equipment</span>
                </button>
                <button class="suggestion-card" onClick={() => handleSuggestionClick("Write a CSS glowing neon Bat-Signal animation styling with backdrop filters.")}>
                  <span class="card-icon">🌕</span>
                  <span class="card-title">CSS Bat-Signal Animation</span>
                  <span class="card-description">Create neon glowing styles</span>
                </button>
              </div>
            </div>
          )}

          {/* Render Saved Messages */}
          {messages.map(msg => (
            <div key={msg.id} className={`message-row ${msg.role === 'user' ? 'user' : 'ai'}`}>
              <div className="avatar">
                {msg.role === 'user' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                )}
              </div>
              <div className="message-wrapper">
                {msg.thinking && msg.role === 'assistant' && (
                  <details className="reasoning-container" open>
                    <summary className="reasoning-header">
                      <span>Reasoning Process</span>
                    </summary>
                    <div className="reasoning-content">{msg.thinking}</div>
                  </details>
                )}
                <div className="bubble">
                  {renderFormattedMarkdown(msg.content)}
                </div>
              </div>
            </div>
          ))}

          {/* Render Active Streams (Thinking & Content) */}
          {(streamThinking || streamContent) && (
            <div className="message-row ai">
              <div className="avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              </div>
              <div className="message-wrapper">
                {streamThinking && (
                  <div className="reasoning-container">
                    <div className="reasoning-header">
                      <span>Reasoning Process</span>
                    </div>
                    <div className="reasoning-content">{streamThinking}</div>
                  </div>
                )}
                {streamContent && (
                  <div className="bubble streaming-cursor">
                    {renderFormattedMarkdown(streamContent)}
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar Panel */}
        <footer class="input-panel">
          <div class="input-container">
            <div class="textarea-wrapper">
              <textarea
                ref={textareaRef}
                class="chat-input"
                placeholder="Initiate query..."
                rows="1"
                maxlength="4000"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
            </div>
            <div class="input-actions">
              <div class="char-counter">{inputText.length} / 4000</div>
              <div class="btn-group">
                {isGenerating && (
                  <button className="stop-btn" onClick={handleStopGeneration} title="Abort generation">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                    </svg>
                  </button>
                )}
                <button
                  className="send-btn"
                  onClick={() => handleSendMessage()}
                  disabled={inputText.trim().length === 0 || isGenerating}
                  title="Send query"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div class="legal-notice">Botman network secure. All logs are synced to your private Supabase cloud database.</div>
        </footer>
      </main>

      {/* Model Parameter Settings Overlay */}
      {settingsActive && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header">
              <h2>Batcomputer settings</h2>
              <button className="close-modal-btn" onClick={() => setSettingsActive(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <div className="modal-body">
              <div className="info-alert">
                <svg className="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <div className="alert-text">
                  Your private <strong>Gemini API Key</strong> is now securely hosted on the server. Adjust generation variance (creativity) thresholds below.
                </div>
              </div>

              <div className="form-group">
                <label>Creativity Variance (Temperature): {temperature}</label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <span className="field-help">Higher thresholds force wide, experimental calculation streams.</span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setSettingsActive(false)}>Save Settings</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
