import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { playSwoosh, playChirp, startSiren } from '@/lib/audio';

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

  // Search, Audio Controls, & Profile Customizations
  const [searchQuery, setSearchQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [profile, setProfile] = useState({ nickname: '', system_prompt: '' });

  // 1. New Features States: Voice Input, File Upload, Public Share
  const [isListening, setIsListening] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null); // { base64, mimeType, name }
  const [shareCopied, setShareCopied] = useState(false);

  // 2. Immersive States: Combat Mode, Lock PIN, Tactical side drawer
  const [combatMode, setCombatMode] = useState(false);
  const [sirenInstance, setSirenInstance] = useState(null);
  const [unlockedChats, setUnlockedChats] = useState(new Set());
  const [pinModalActive, setPinModalActive] = useState(false);
  const [pinMode, setPinMode] = useState('set'); // 'set' | 'enter'
  const [pinValue, setPinValue] = useState('');
  const [pinChatId, setPinChatId] = useState(null);
  const [decryptingText, setDecryptingText] = useState(false); // Matrix anim state
  
  const [tacticalPanelActive, setTacticalPanelActive] = useState(false);
  const [gadgetCounts, setGadgetCounts] = useState({ batarangs: 10, grapple_charge: 100, smoke_pellets: 5 });
  const [stockQuotes, setStockQuotes] = useState({ WAYN: 184.20, GOTH: 96.50, ARKM: 124.80 });

  // Streaming State (For real-time UI accumulation)
  const [streamContent, setStreamContent] = useState('');
  const [streamThinking, setStreamThinking] = useState('');

  // Refs for DOM management
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);
  const visualizerCanvasRef = useRef(null);
  const radarCanvasRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const radarAnimationFrameIdRef = useRef(null);

  const currentUser = session?.user;
  const username = currentUser?.email?.split('@')[0] || 'Agent';
  const displayName = profile.nickname || username;

  // ----------------------------------------------------
  // Database Synchronization Operations
  // ----------------------------------------------------

  const fetchProfile = async () => {
    if (!currentUser?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setProfile({
          nickname: data.nickname || '',
          system_prompt: data.system_prompt || ''
        });
        if (data.gadgets) {
          setGadgetCounts(data.gadgets);
        }
      }
    } catch (err) {
      console.error("Error fetching profile details:", err);
    }
  };

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

  // On mount: Fetch profile metadata, chats list and auto-select
  useEffect(() => {
    const initData = async () => {
      await fetchProfile();
      const chatList = await fetchChats();
      if (chatList && chatList.length > 0) {
        setActiveChatId(chatList[0].id);
      } else {
        await handleCreateChat();
      }
    };
    initData();
  }, []);

  // ----------------------------------------------------
  // Immersive Upgrades Systems Operations
  // ----------------------------------------------------

  const handleChatClick = (chat) => {
    // If switching to a different chat, re-lock the previous chat if it was encrypted
    if (activeChatId && activeChatId !== chat.id) {
      const prevChat = chats.find(c => c.id === activeChatId);
      if (prevChat && prevChat.is_encrypted) {
        setUnlockedChats(prev => {
          const next = new Set(prev);
          next.delete(activeChatId);
          return next;
        });
      }
    }

    if (chat.is_encrypted && !unlockedChats.has(chat.id)) {
      setPinChatId(chat.id);
      setPinMode('enter');
      setPinValue('');
      setPinModalActive(true);
    } else {
      setActiveChatId(chat.id);
    }
  };

  const handleVerifyPin = () => {
    const chat = chats.find(c => c.id === pinChatId);
    if (chat && pinValue === chat.encryption_pin) {
      setUnlockedChats(prev => {
        const next = new Set(prev);
        next.add(pinChatId);
        return next;
      });
      setPinModalActive(false);
      
      setDecryptingText(true);
      if (soundEnabled) playChirp();
      setTimeout(() => {
        setDecryptingText(false);
        setActiveChatId(pinChatId);
      }, 600);
    } else {
      alert("INCORRECT DECRYPTION PIN. ACCESS LOCKED.");
      setPinValue('');
    }
  };

  const handleSetChatPin = async () => {
    if (pinValue.length !== 4) {
      alert("PIN must be exactly 4 digits.");
      return;
    }
    try {
      const { error } = await supabase
        .from('chats')
        .update({
          is_encrypted: true,
          encryption_pin: pinValue
        })
        .eq('id', pinChatId);

      if (error) throw error;

      setChats(prev => prev.map(c => c.id === pinChatId ? { ...c, is_encrypted: true, encryption_pin: pinValue } : c));
      setUnlockedChats(prev => {
        const next = new Set(prev);
        next.add(pinChatId);
        return next;
      });
      setPinModalActive(false);
      if (soundEnabled) playChirp();
    } catch (err) {
      console.error("Error setting chat PIN:", err);
      alert("Failed to encrypt chat: " + err.message);
    }
  };

  const handleToggleCombatMode = () => {
    const newState = !combatMode;
    setCombatMode(newState);

    if (typeof document !== 'undefined') {
      document.getElementById('app-container')?.classList.toggle('combat-active', newState);
    }

    if (newState) {
      const siren = startSiren();
      setSirenInstance(siren);
    } else {
      if (sirenInstance) {
        sirenInstance.stop();
        setSirenInstance(null);
      }
    }
  };

  const handleUseGadget = async (type) => {
    if (gadgetCounts[type] <= 0) {
      alert(`OUT OF ${type.toUpperCase()} ARSENAL! REPLENISH CONSOLE REQUIRED.`);
      return;
    }

    const updatedCounts = {
      ...gadgetCounts,
      [type]: gadgetCounts[type] - (type === 'grapple_charge' ? 10 : 1)
    };

    setGadgetCounts(updatedCounts);
    if (soundEnabled) playChirp();

    try {
      await supabase
        .from('profiles')
        .update({ gadgets: updatedCounts })
        .eq('id', currentUser.id);
    } catch(err) {
      console.warn("Could not save inventory count:", err);
    }
  };

  const handleReplenishGadgets = async () => {
    const fullCounts = { batarangs: 10, grapple_charge: 100, smoke_pellets: 5 };
    setGadgetCounts(fullCounts);
    if (soundEnabled) playSwoosh();

    try {
      await supabase
        .from('profiles')
        .update({ gadgets: fullCounts })
        .eq('id', currentUser.id);
    } catch(err) {
      console.warn("Could not save inventory count:", err);
    }
  };

  // Siren unmount cleanup
  useEffect(() => {
    return () => {
      if (sirenInstance) {
        sirenInstance.stop();
      }
    };
  }, [sirenInstance]);

  // Tactical systems side panel animations & ticks
  useEffect(() => {
    if (!tacticalPanelActive) {
      if (radarAnimationFrameIdRef.current) {
        cancelAnimationFrame(radarAnimationFrameIdRef.current);
      }
      return;
    }

    // Stocks simulation
    const stockInterval = setInterval(() => {
      setStockQuotes(prev => {
        const bounce = (val) => +(val + (Math.random() - 0.5) * 0.4).toFixed(2);
        return {
          WAYN: bounce(prev.WAYN),
          GOTH: bounce(prev.GOTH),
          ARKM: bounce(prev.ARKM)
        };
      });
    }, 2000);

    // Radar canvas loop
    const canvas = radarCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      let angle = 0;
      let blipX = Math.random() * 80 + 40;
      let blipY = Math.random() * 80 + 40;
      let blipAlpha = 1;

      const drawRadar = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = Math.min(cx, cy) - 5;

        // Concentric rings
        ctx.strokeStyle = combatMode ? 'rgba(255, 51, 51, 0.15)' : 'rgba(255, 204, 0, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.66, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.33, 0, Math.PI * 2);
        ctx.stroke();

        // Cross lines
        ctx.beginPath();
        ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // Line sweep
        angle += 0.035;
        const sweepX = cx + Math.cos(angle) * radius;
        const sweepY = cy + Math.sin(angle) * radius;
        
        ctx.strokeStyle = combatMode ? 'rgba(255, 51, 51, 0.7)' : 'rgba(255, 204, 0, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sweepX, sweepY);
        ctx.stroke();

        // Trail fill
        ctx.fillStyle = combatMode ? 'rgba(255, 51, 51, 0.04)' : 'rgba(255, 204, 0, 0.04)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, angle - 0.25, angle);
        ctx.fill();

        // Warning target blip
        blipAlpha -= 0.008;
        if (blipAlpha <= 0) {
          const blipDist = Math.random() * (radius - 15);
          const blipAng = Math.random() * Math.PI * 2;
          blipX = cx + Math.cos(blipAng) * blipDist;
          blipY = cy + Math.sin(blipAng) * blipDist;
          blipAlpha = 1.0;
        }

        ctx.fillStyle = combatMode ? `rgba(255, 51, 51, ${blipAlpha})` : `rgba(255, 204, 0, ${blipAlpha})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = combatMode ? '#ff3333' : 'var(--accent-yellow)';
        ctx.beginPath();
        ctx.arc(blipX, blipY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        radarAnimationFrameIdRef.current = requestAnimationFrame(drawRadar);
      };
      drawRadar();
    }

    return () => {
      clearInterval(stockInterval);
      if (radarAnimationFrameIdRef.current) {
        cancelAnimationFrame(radarAnimationFrameIdRef.current);
      }
    };
  }, [tacticalPanelActive, combatMode]);

  // Whenever active chat changes: Load its messages
  useEffect(() => {
    if (activeChatId) {
      fetchMessages(activeChatId);
      const activeChat = chats.find(c => c.id === activeChatId);
      if (activeChat) {
        setModel(activeChat.model || 'gemini-2.5-flash');
      }
    } else {
      setMessages([]);
    }
    setStreamContent('');
    setStreamThinking('');
    setAttachedFile(null);
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
      setSpeakingMessageId(null);
    }
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
  // Glowing Batcomputer Audio Visualizer Loop
  // ----------------------------------------------------
  useEffect(() => {
    const canvas = visualizerCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let angle = 0;

    const renderVisualizer = () => {
      const active = isGenerating || speakingMessageId !== null || isListening;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 14;

      // Glow effect styling
      ctx.shadowBlur = active ? 12 : 2;
      ctx.shadowColor = isListening ? '#38bdf8' : 'var(--accent-yellow)';

      // Outer pulsing ring
      ctx.beginPath();
      const pulseFactor = active ? Math.sin(angle) * 4 : 0;
      ctx.arc(centerX, centerY, baseRadius + pulseFactor, 0, Math.PI * 2);
      ctx.strokeStyle = isListening ? 'rgba(56, 189, 248, 0.6)' : 'rgba(255, 204, 0, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner glowing core
      ctx.beginPath();
      ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
      ctx.fillStyle = isListening ? '#38bdf8' : 'var(--accent-yellow)';
      ctx.fill();

      // Animated orbiting wave nodes if active
      if (active) {
        angle += 0.15;
        const waveCount = 4;
        for (let i = 0; i < waveCount; i++) {
          const offsetAngle = angle + (i * Math.PI / 2);
          const nodeX = centerX + Math.cos(offsetAngle) * (baseRadius + 6);
          const nodeY = centerY + Math.sin(offsetAngle) * (baseRadius + 6);
          ctx.beginPath();
          ctx.arc(nodeX, nodeY, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = isListening ? '#7dd3fc' : '#fff';
          ctx.fill();
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(renderVisualizer);
    };

    renderVisualizer();

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [isGenerating, speakingMessageId, isListening]);

  // ----------------------------------------------------
  // Speech-To-Text Recognition (Voice Input)
  // ----------------------------------------------------
  const handleToggleVoiceInput = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please try Google Chrome.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      if (soundEnabled) playChirp();
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInputText(prev => prev + (prev ? " " : "") + transcript);
    };

    recognition.onerror = (err) => {
      console.error("Speech recognition error:", err);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // ----------------------------------------------------
  // Multi-modal File Reader (Image / Text upload)
  // ----------------------------------------------------
  const handleFileAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit to 4MB max for free Gemini API rate bounds
    if (file.size > 4 * 1024 * 1024) {
      alert("File is too large. Please select an image or text file smaller than 4MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
      setAttachedFile({
        base64: base64Data,
        mimeType: file.type,
        name: file.name
      });
    };

    reader.readAsDataURL(file);
    e.target.value = ""; // Reset input selection
  };

  // ----------------------------------------------------
  // Public Chat Sharing Link Toggler
  // ----------------------------------------------------
  const handleToggleShare = async () => {
    if (!activeChatId) return;

    const activeChat = chats.find(c => c.id === activeChatId);
    const updatedSharedState = !activeChat?.is_shared;

    try {
      const { error } = await supabase
        .from('chats')
        .update({ is_shared: updatedSharedState })
        .eq('id', activeChatId);

      if (error) throw error;

      // Update local state list
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, is_shared: updatedSharedState } : c));

      if (updatedSharedState) {
        const shareLink = `${window.location.origin}/share/${activeChatId}`;
        navigator.clipboard.writeText(shareLink).then(() => {
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 3000);
        });
      }
    } catch (err) {
      console.error("Error updating share settings:", err);
      alert("Failed to toggle sharing permissions: " + err.message);
    }
  };

  // ----------------------------------------------------
  // Profile Configuration & Actions
  // ----------------------------------------------------

  const handleSaveProfile = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          nickname: profile.nickname,
          system_prompt: profile.system_prompt
        })
        .eq('id', currentUser.id);

      if (error) throw error;
      setSettingsActive(false);
      if (soundEnabled) playChirp();
    } catch (err) {
      console.error("Error saving profile:", err);
      alert("Failed to update profile settings: " + err.message);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("CRITICAL WARNING: This will permanently delete your user profile and purge all messages from the database. This action is irreversible. Proceed?")) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', currentUser.id);

      if (error) throw error;
      await supabase.auth.signOut();
      onSignOut();
    } catch (err) {
      console.error("Error deleting account:", err);
      alert("Failed to delete account: " + err.message);
    }
  };

  // ----------------------------------------------------
  // Chat Actions
  // ----------------------------------------------------

  const handleCreateChat = async () => {
    try {
      const newChat = {
        user_id: currentUser.id,
        title: 'New Mission',
        model: model,
        is_shared: false
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
    
    // Allow sending just a file attachment without text
    if (!textToSend && !attachedFile) return;
    if (!activeChatId || isGenerating) return;

    setInputText('');
    setIsGenerating(true);
    setStreamContent('');
    setStreamThinking('');

    // Capture files locally and clear selection preview
    const activeFile = attachedFile;
    setAttachedFile(null);

    // Trigger Batcave sound effect
    if (soundEnabled) playSwoosh();

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
      content: textToSend + (activeFile ? `\n\n*[Attached file: ${activeFile.name}]*` : '')
    };

    try {
      const { data: userMsg, error: userMsgErr } = await supabase
        .from('messages')
        .insert([userMsgData])
        .select();

      if (userMsgErr) throw userMsgErr;
      setMessages(prev => [...prev, userMsg[0]]);

      // Auto rename chat title if it's the first message
      const isFirstMessage = currentMessages.length === 0;
      let newTitle = activeChat?.title;
      if (isFirstMessage) {
        const titleSource = textToSend || activeFile?.name || 'Attachment Log';
        newTitle = titleSource.length > 24 ? titleSource.substring(0, 24) + '...' : titleSource;
        await supabase
          .from('chats')
          .update({ title: newTitle })
          .eq('id', activeChatId);

        setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, title: newTitle } : c));
      }

      // 2. Trigger Server-Side Streaming API Route
      const requestMessages = [
        ...currentMessages.map(m => ({ role: m.role, content: m.content })),
        { 
          role: 'user', 
          content: textToSend,
          fileData: activeFile // Pass Base64 data if present
        }
      ];

      // Prepare simulated thinking logs before streaming live answers
      let simulated = chatModel.endsWith('-sim');
      if (simulated) {
        const thinkingSteps = [
          "Accessing Batcomputer database...",
          "Decrypting regional security feeds...",
          "Routing signal via Wayne Enterprises satellites...",
          "Uplink active. Stream initiation authorized."
        ];
        
        let accumThinking = "";
        for (let i = 0; i < thinkingSteps.length; i++) {
          if (controller.signal.aborted) throw new Error("Stopped");
          accumThinking += (i > 0 ? "\n" : "") + "▸ " + thinkingSteps[i];
          setStreamThinking(accumThinking);
          await new Promise(r => setTimeout(r, 300));
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: chatModel,
          messages: requestMessages,
          temperature: temperature,
          customSystemPrompt: profile.system_prompt, // Send custom system instructions override
          combatMode: combatMode
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `API status code ${response.status}`);
      }

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

      // 3. Save Assistant Message to Cloud Database
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
      setMessages(prev => [...prev, aiMsg[0]]);

      // Play completion beep
      if (soundEnabled) playChirp();

    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Stopped') {
        const cancelMsg = "\n\n*[Uplink transmission terminated by user]*";
        setStreamContent(prev => prev + cancelMsg);
        
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
  // Text-To-Speech Output Controller
  // ----------------------------------------------------

  const handleToggleSpeech = (msg) => {
    if (typeof window === 'undefined') return;

    if (speakingMessageId === msg.id) {
      window.speechSynthesis?.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis?.cancel();

    const textToRead = msg.content
      .replace(/```[\s\S]*?```/g, '[code block omitted]')
      .replace(/[*#_~`>\[\]\(\)]/g, '')
      .trim();

    if (!textToRead) return;

    const utterance = new SpeechSynthesisUtterance(textToRead);
    const voices = window.speechSynthesis?.getVoices() || [];
    
    const tacticalVoice = voices.find(v => 
      v.lang.startsWith('en') && 
      (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('microsoft david') || v.name.toLowerCase().includes('natural'))
    );
    
    if (tacticalVoice) utterance.voice = tacticalVoice;
    utterance.pitch = 0.85;
    utterance.rate = 0.95;

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(msg.id);
    window.speechSynthesis?.speak(utterance);
  };

  // ----------------------------------------------------
  // Markdown rendering engine
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

  const handleDownloadImage = async (url, promptName) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const safeName = promptName.substring(0, 24).replace(/[^a-zA-Z0-9]/g, '_') || 'batcomputer_img';
      link.download = `${safeName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Image download failed:", error);
      window.open(url, '_blank');
    }
  };

  const renderFormattedMarkdown = (text) => {
    if (!text) return "";
    const parts = text.split(/```/g);
    
    return parts.map((part, idx) => {
      if (idx % 2 === 1) {
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
        const paragraphs = part.split('\n');
        let inList = false;
        let listItems = [];
        
        return paragraphs.map((line, lineIdx) => {
          const trimmed = line.trim();
          const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
          
          if (listMatch) {
            inList = true;
            listItems.push(listMatch[1]);
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
          
          const boldParts = line.split(/\*\*([^*]+)\*\*/g);
          const hasBold = boldParts.length > 1;

          const renderLineContent = () => {
            if (!hasBold) return line;
            return boldParts.map((subPart, bIdx) => (
              bIdx % 2 === 1 ? <strong key={bIdx} style={{ color: '#fff', fontWeight: 600 }}>{subPart}</strong> : subPart
            ));
          };

          if (trimmed) {
            const urlIndex = trimmed.indexOf("https://image.pollinations.ai/prompt/");
            if (urlIndex !== -1) {
              let urlEnd = trimmed.indexOf(")", urlIndex);
              if (urlEnd === -1) {
                urlEnd = trimmed.length;
              }
              const rawUrl = trimmed.substring(urlIndex, urlEnd);
              const cleanUrl = rawUrl.replace(/\s+/g, "%20");
              const textBefore = trimmed.substring(0, trimmed.indexOf("![") !== -1 ? trimmed.indexOf("![") : urlIndex).trim();
              const textAfter = trimmed.substring(urlEnd + (trimmed[urlEnd] === ')' ? 1 : 0)).trim();

              return (
                <div key={`${idx}-${lineIdx}`} style={{ marginBottom: '1rem' }}>
                  {textBefore && <p style={{ marginBottom: '0.5rem' }}>{textBefore}</p>}
                  <div className="ai-generated-image" style={{ margin: '1rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-glass)', background: '#09090e', position: 'relative' }}>
                    <img 
                      src={cleanUrl} 
                      alt="AI Generated Visual" 
                      style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', display: 'block' }}
                      loading="lazy"
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.5)', padding: '0.4rem 0.8rem', borderTop: '1px solid var(--border-glass)' }}>
                      <button 
                        onClick={() => handleDownloadImage(cleanUrl, trimmed)}
                        style={{
                          background: 'rgba(255, 204, 0, 0.1)',
                          border: '1px solid rgba(255, 204, 0, 0.2)',
                          color: 'var(--accent-yellow)',
                          borderRadius: '4px',
                          padding: '0.2rem 0.6rem',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'background 0.2s'
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                  {textAfter && <p style={{ marginTop: '0.5rem' }}>{textAfter}</p>}
                </div>
              );
            }

            return (
              <p key={`${idx}-${lineIdx}`} style={{ marginBottom: '0.75rem' }}>
                {renderLineContent()}
              </p>
            );
          }
          return null;
        });
      }
    });
  };

  const handleSuggestionClick = (prompt) => {
    setInputText(prompt);
    handleSendMessage(prompt);
  };

  const filteredChats = chats.filter(chat => 
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeChat = chats.find(c => c.id === activeChatId);

  return (
    <div className="app-container" id="app-container">
      
      {/* Sidebar navigation */}
      <aside className={`sidebar ${sidebarActive ? 'active' : ''}`} id="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <svg className="sparkle-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12,7.5c-0.5,0-0.9-0.4-1.2-0.8c-0.7-1.1-1.5-2.2-2.3-3.2c-0.1-0.2-0.3-0.2-0.5-0.1c-0.2,0.1-0.2,0.3-0.1,0.5c0.7,1.4,1,2.8,1,4.4c0,0.4-0.1,0.7-0.4,1c-1.8,1.8-4.2,2.5-6.7,2.2c-0.3,0-0.6,0.2-0.7,0.5c-0.1,0.3,0.1,0.6,0.3,0.7c2.5,1.2,4.8,2.7,6.7,4.8c0.2,0.2,0.4,0.3,0.7,0.3c0.7,0.1,1.1,0.7,1.5,1.2c0.7,1,1.5,1.9,2.4,2.7c0.2,0.2,0.5,0.2,0.7,0c0.9-0.8,1.7-1.7,2.4-2.7c0.4-0.5,0.8-1.1,1.5-1.2c0.3,0,0.5-0.1,0.7-0.3c1.9-2.1,4.2-3.6,6.7-4.8c0.2-0.1,0.4-0.4,0.3-0.7c-0.1-0.3-0.4-0.5-0.7-0.5c-2.5,0.3-4.9-0.4-6.7-2.2c-0.3-0.3-0.4-0.6-0.4-1c0-1.6,0.3-3,1-4.4c0.1-0.2,0-0.4-0.1-0.5c-0.2-0.1-0.4-0.1-0.5,0.1c-0.8,1-1.6,2.1-2.3,3.2C12.9,7.1,12.5,7.5,12,7.5z" fill="url(#gradient-accent-sidebar)"/>
              <defs>
                <linearGradient id="gradient-accent-sidebar" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ffe600"/>
                  <stop offset="1" stopColor="#b58500"/>
                </linearGradient>
              </defs>
            </svg>
            <span>BOTMAN</span>
          </div>
          <button className="new-chat-btn" onClick={handleCreateChat} title="Start new mission">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>New Mission</span>
          </button>
        </div>

        {/* Search Mission Logs Filter */}
        <div style={{ padding: '0 0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                padding: '0.4rem 0.6rem 0.4rem 1.8rem',
                fontSize: '0.8rem',
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                transition: 'border-color 0.2s'
              }}
            />
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="var(--text-secondary)" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{ position: 'absolute', left: '0.6rem', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, fontSize: '0.85rem' }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <nav className="history-panel" id="history-panel">
          <div className="section-title">Mission Logs</div>
          <div className="chats-list" id="chats-list">
            {filteredChats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                No records found
              </div>
            ) : (
              filteredChats.map(chat => {
                const isLocked = chat.is_encrypted && !unlockedChats.has(chat.id);
                return (
                  <div
                    key={chat.id}
                    className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                    onClick={() => handleChatClick(chat)}
                  >
                    <div className="chat-item-left">
                      {isLocked ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-yellow)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}>
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                      )}
                      <span className="chat-item-title" style={{ fontStyle: isLocked ? 'italic' : 'normal', opacity: isLocked ? 0.7 : 1 }}>
                        {isLocked ? 'CLASSIFIED LOG' : chat.title}
                      </span>
                    </div>
                    <div className="chat-item-actions">
                      <button className="chat-action-btn" title="Delete conversation" onClick={(e) => handleDeleteChat(chat.id, e)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', color: 'var(--accent-yellow)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>👤 {displayName}</span>
            <span style={{ cursor: 'pointer', opacity: 0.8 }} onClick={onSignOut} title="Sign Out">Sign Out 🚪</span>
          </div>
          <button className="footer-action-btn" id="settings-btn" onClick={() => setSettingsActive(true)} title="Batcomputer Parameters">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span>Batcomputer Settings</span>
          </button>
          <button className="footer-action-btn delete-btn" id="clear-chats-btn" onClick={handleClearAllChats} title="Purge database logs">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" strokeLinecap="round" strokeLinejoin="round">
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
      <main className="chat-workspace">
        
        <header className="navbar">
          <div className="nav-left">
            <button className="menu-toggle-btn" onClick={() => setSidebarActive(!sidebarActive)} aria-label="Toggle Sidebar">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="chat-title" id="chat-title">
              {activeChat?.title || 'New Mission'}
            </div>
            {/* Share link button */}
            {activeChatId && (
              <button 
                onClick={handleToggleShare}
                style={{
                  background: 'none',
                  border: 'none',
                  color: activeChat?.is_shared ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  marginLeft: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
                title="Share this mission transcript publicly"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                <span>{activeChat?.is_shared ? (shareCopied ? 'Link Copied!' : 'Shared') : 'Share'}</span>
              </button>
            )}

            {/* Classified Lock PIN toggle */}
            {activeChatId && (
              <button 
                onClick={() => {
                  setPinChatId(activeChatId);
                  setPinMode(activeChat?.is_encrypted ? 'enter' : 'set');
                  setPinValue('');
                  setPinModalActive(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: activeChat?.is_encrypted ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  marginLeft: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
                title={activeChat?.is_encrypted ? "Chat is PIN Protected" : "Encrypt this chat with a PIN"}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>{activeChat?.is_encrypted ? 'Classified' : 'Lock'}</span>
              </button>
            )}
          </div>

          <div className="nav-right">
            <div className="model-select-wrapper">
              <select className="model-selector" value={model} onChange={handleModelChange}>
                <option value="gemini-2.5-flash">Batcomputer Core (Flash)</option>
                <option value="gemini-2.5-pro">Batcomputer Core (Pro)</option>
                <option value="gemini-1.5-flash">Batcomputer Core (Legacy)</option>
                <option value="claude-3-5-sonnet-sim">Alfred-3.5 (Simulated)</option>
                <option value="gpt-4o-sim">Oracle-4o (Simulated)</option>
              </select>
            </div>

            {/* Red Alert warning button */}
            <button 
              onClick={handleToggleCombatMode}
              style={{
                background: combatMode ? 'rgba(255, 51, 51, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                border: combatMode ? '1px solid #ff3333' : '1px solid var(--border-glass)',
                color: combatMode ? '#ff3333' : 'var(--text-secondary)',
                cursor: 'pointer',
                borderRadius: '8px',
                padding: '0.4rem 0.6rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                boxShadow: combatMode ? '0 0 15px rgba(255, 51, 51, 0.25)' : 'none'
              }}
              title="Toggle Red Alert Combat Mode"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </button>

            {/* Tactical Side panel toggle button */}
            <button 
              onClick={() => setTacticalPanelActive(!tacticalPanelActive)}
              style={{
                background: tacticalPanelActive ? 'rgba(255, 204, 0, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-glass)',
                color: tacticalPanelActive ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                cursor: 'pointer',
                borderRadius: '8px',
                padding: '0.4rem 0.6rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              title="Toggle Wayne Enterprises Tactical Panel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
            </button>

            {/* Glowing Spectrum Audio Visualizer Canvas */}
            <div className="status-indicator" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <canvas 
                ref={visualizerCanvasRef} 
                width="34" 
                height="34" 
                style={{ width: '34px', height: '34px', marginRight: '-5px' }}
              />
              <span className="status-text" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {isListening ? 'Listening...' : (isGenerating ? 'Decrypting...' : 'Online')}
              </span>
            </div>
            
            <button className="nav-new-chat-btn" onClick={handleCreateChat} title="Start new mission">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </header>

        {/* Message Container Area */}
        <div className="messages-container" id="messages-container">
          
          {decryptingText ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontFamily: 'var(--font-mono)',
              color: '#00ff00',
              textShadow: '0 0 8px rgba(0, 255, 0, 0.4)',
              fontSize: '1.05rem',
              letterSpacing: '2px',
              gap: '15px'
            }}>
              <span>▸ INITIALIZING ACCESS NODE DECRYPTION...</span>
              <span className="streaming-cursor">▸ DECRYPTING SECURED UPLINK LOGS</span>
            </div>
          ) : (
            <>
            {messages.length === 0 && !streamContent && !streamThinking && (
            <div className="welcome-screen" id="welcome-screen">
              <div className="welcome-header">
                <h1 className="gradient-text">I am Botman. I stand watch.</h1>
                <p className="subtitle">Uplink established, {displayName}. Configure settings to alter my persona, attach files, or speak commands.</p>
              </div>

              <div className="suggestion-grid">
                <button className="suggestion-card" onClick={() => handleSuggestionClick("Help me write a Python script to scan the Gotham harbor surveillance cameras.")}>
                  <span className="card-icon">🦇</span>
                  <span className="card-title">Scan Gotham harbor</span>
                  <span className="card-description">Write surveillance python script</span>
                </button>
                <button className="suggestion-card" onClick={() => handleSuggestionClick("Compare Batcomputer security database schemas: SQL relational integrity vs NoSQL decentralization.")}>
                  <span className="card-icon">🛡️</span>
                  <span className="card-title">Compare security schemas</span>
                  <span className="card-description">SQL vs NoSQL integrity check</span>
                </button>
                <button className="suggestion-card" onClick={() => handleSuggestionClick("Brainstorm 5 tactical gadget ideas to assist search and rescue teams in dark locations.")}>
                  <span className="card-icon">⚡</span>
                  <span className="card-title">Tactical Gadget Ideas</span>
                  <span className="card-description">Brainstorming search equipment</span>
                </button>
                <button className="suggestion-card" onClick={() => handleSuggestionClick("Write a CSS glowing neon Bat-Signal animation styling with backdrop filters.")}>
                  <span className="card-icon">🌕</span>
                  <span className="card-title">CSS Bat-Signal Animation</span>
                  <span className="card-description">Create neon glowing styles</span>
                </button>
              </div>
            </div>
          )}

          {/* Render Saved Messages */}
          {messages.map(msg => (
            <div key={msg.id} className={`message-row ${msg.role === 'user' ? 'user' : 'ai'}`}>
              <div className="avatar">
                {msg.role === 'user' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
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
                  {msg.role === 'assistant' && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => handleToggleSpeech(msg)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: speakingMessageId === msg.id ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '0.7rem',
                          padding: '0.2rem'
                        }}
                        title={speakingMessageId === msg.id ? "Stop voice" : "Read response"}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                        <span>{speakingMessageId === msg.id ? "Silence" : "Speak"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Render Active Streams (Thinking & Content) */}
          {(streamThinking || streamContent) && (
            <div className="message-row ai">
              <div className="avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
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
          </>
          )}
        </div>

        {/* Input Bar Panel */}
        <footer className="input-panel">
          
          {/* File Attachment Preview Selection Bar */}
          {attachedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.4rem 1rem', background: 'rgba(255,204,0,0.03)', border: '1px solid rgba(255,204,0,0.1)', borderBottom: 'none', borderTopLeftRadius: '12px', borderTopRightRadius: '12px', width: 'calc(100% - 2px)', margin: '0 auto', fontSize: '0.8rem', color: '#fff' }}>
              <span>📎 {attachedFile.name}</span>
              <button 
                onClick={() => setAttachedFile(null)} 
                style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                title="Remove attachment"
              >
                Remove
              </button>
            </div>
          )}

          <div className="input-container" style={{ borderTopLeftRadius: attachedFile ? 0 : '12px', borderTopRightRadius: attachedFile ? 0 : '12px' }}>
            
            {/* Paperclip File Attach Hidden Input & Icon Button */}
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*,text/*,application/pdf"
              onChange={handleFileChange}
            />
            <button 
              className="attach-btn" 
              onClick={handleFileAttachClick} 
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.75rem 0.5rem 0.75rem 1rem', display: 'flex', alignItems: 'center' }}
              title="Attach an image or file for analysis"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>

            <div className="textarea-wrapper">
              <textarea
                ref={textareaRef}
                className="chat-input"
                placeholder={isListening ? "Listening..." : "Initiate query..."}
                rows="1"
                maxLength="4000"
                value={inputText}
                disabled={isListening}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
            </div>
            
            <div className="input-actions" style={{ paddingLeft: '0.5rem' }}>
              <div className="char-counter">{inputText.length} / 4000</div>
              <div className="btn-group">
                
                {/* Speech Recognition microphone activation button */}
                <button 
                  onClick={handleToggleVoiceInput} 
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isListening ? '#38bdf8' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '0.4rem',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={isListening ? "Stop listening" : "Speak your query"}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                </button>

                {isGenerating && (
                  <button className="stop-btn" onClick={handleStopGeneration} title="Abort generation">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                    </svg>
                  </button>
                )}
                <button
                  className="send-btn"
                  onClick={() => handleSendMessage()}
                  disabled={(inputText.trim().length === 0 && !attachedFile) || isGenerating}
                  title="Send query"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div className="legal-notice">Botman network secure. All logs are synced to your private Supabase cloud database.</div>
        </footer>
      </main>

      {/* Model Parameter & Profile Settings Overlay */}
      {settingsActive && (
        <div className="modal-overlay active">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Batcomputer Uplink Settings</h2>
              <button className="close-modal-btn" onClick={() => setSettingsActive(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto', paddingRight: '5px' }}>
              
              {/* Profile Config section */}
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--accent-yellow)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Agent Credentials</h3>
                
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>Code Alias (Nickname)</label>
                  <input
                    type="text"
                    value={profile.nickname}
                    onChange={(e) => setProfile(prev => ({ ...prev, nickname: e.target.value }))}
                    placeholder={username}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)'
                    }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>Custom System Directives (AI Persona)</label>
                  <textarea
                    rows="3"
                    value={profile.system_prompt}
                    onChange={(e) => setProfile(prev => ({ ...prev, system_prompt: e.target.value }))}
                    placeholder="e.g. Speak only in Spanish, or: Answer like a senior database engineer"
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      resize: 'vertical'
                    }}
                  />
                  <span className="field-help" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>These instructions override Botman's conversational protocols.</span>
                </div>
              </div>

              {/* Preferences Section */}
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--accent-yellow)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Audio Controls</h3>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="sound-fx-checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent-yellow)' }}
                  />
                  <label htmlFor="sound-fx-checkbox" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    Enable Batcave Sound Effects (Swooshes & Bleeps)
                  </label>
                </div>
              </div>

              {/* Model Parameter section */}
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--accent-yellow)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Model Tuning</h3>
                
                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>Creativity Variance (Temperature): {temperature}</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-yellow)' }}
                  />
                  <span className="field-help" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Higher values unlock wider, more experimental calculation streams.</span>
                </div>
              </div>

              {/* Danger Zone */}
              <div>
                <h3 style={{ fontSize: '0.9rem', color: '#ff3333', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Danger Zone</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,51,51,0.03)', border: '1px dashed rgba(255,51,51,0.3)', padding: '0.75rem', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>Decommission Access Node</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Wipe profile metadata and delete all chat transcripts forever.</div>
                  </div>
                  <button 
                    onClick={handleDeleteAccount}
                    style={{
                      background: '#ff3333',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'opacity 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.opacity = '0.9'}
                    onMouseOut={(e) => e.target.style.opacity = '1'}
                  >
                    Delete Account
                  </button>
                </div>
              </div>

            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSettingsActive(false)} style={{ marginRight: '0.5rem' }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveProfile}>Save Config</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Classified Security PIN Padlock Modal Overlay */}
      {pinModalActive && (
        <div className="modal-overlay active">
          <div className="modal" style={{ maxWidth: '360px', textAlign: 'center' }}>
            <div className="modal-header">
              <h2>{pinMode === 'set' ? 'Set Security Encryption PIN' : 'Security Check: Classified Log'}</h2>
              <button className="close-modal-btn" onClick={() => setPinModalActive(false)}>
                ×
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{ fontSize: '2rem', color: 'var(--accent-yellow)', margin: '0.5rem 0' }}>
                🔑
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {pinMode === 'set' 
                  ? 'Define a 4-digit code to lock this mission transcript. Anyone wanting to access this chat will be prompted to enter this code.'
                  : 'This database log is locked. Enter the 4-digit decryption code to establish uplink.'
                }
              </p>
              
              {/* Dot PIN inputs */}
              <div style={{ display: 'flex', gap: '1rem', margin: '0.5rem 0' }}>
                {[0, 1, 2, 3].map(idx => (
                  <div key={idx} style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: pinValue.length > idx ? 'var(--accent-yellow)' : 'transparent',
                    border: '2px solid var(--accent-yellow)',
                    boxShadow: pinValue.length > idx ? '0 0 8px var(--accent-yellow)' : 'none',
                    transition: 'all 0.15s'
                  }} />
                ))}
              </div>

              {/* Padlock grid values */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.75rem',
                width: '210px',
                marginTop: '0.5rem'
              }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button 
                    key={num}
                    onClick={() => pinValue.length < 4 && setPinValue(prev => prev + num)}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: '8px',
                      color: '#fff',
                      padding: '0.6rem',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    {num}
                  </button>
                ))}
                <button 
                  onClick={() => setPinValue('')}
                  style={{
                    background: 'rgba(255,51,51,0.05)',
                    border: '1px solid rgba(255,51,51,0.1)',
                    borderRadius: '8px',
                    color: '#ff4444',
                    padding: '0.6rem',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
                <button 
                  onClick={() => pinValue.length < 4 && setPinValue(prev => prev + '0')}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '0.6rem',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  0
                </button>
                <button 
                  onClick={pinMode === 'set' ? handleSetChatPin : handleVerifyPin}
                  disabled={pinValue.length !== 4}
                  style={{
                    background: pinValue.length === 4 ? 'rgba(255,204,0,0.15)' : 'rgba(255,255,255,0.01)',
                    border: pinValue.length === 4 ? '1px solid var(--accent-yellow)' : '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    color: pinValue.length === 4 ? 'var(--accent-yellow)' : 'var(--text-muted)',
                    padding: '0.6rem',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    cursor: pinValue.length === 4 ? 'pointer' : 'not-allowed'
                  }}
                >
                  Enter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Sliding Tactical Side Panel */}
      <div className={`tactical-panel ${tacticalPanelActive ? 'active' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)', letterSpacing: '1px' }}>
            TACTICAL MONITORING
          </h2>
          <button 
            onClick={() => setTacticalPanelActive(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.25rem', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {/* Live radar canvas */}
        <div className="tactical-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <h3>Scanning Radar Feed</h3>
          <canvas 
            ref={radarCanvasRef} 
            width="160" 
            height="160" 
            style={{ background: '#040406', borderRadius: '50%', border: '1px solid var(--border-glass)' }}
          />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', letterSpacing: '1px' }}>
            🛰️ satellite link: active
          </span>
        </div>

        {/* Gadget Arsenal inventory */}
        <div className="tactical-card">
          <h3>Wayne Tech Arsenal</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            
            {/* Batarangs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Batarangs</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Count: {gadgetCounts.batarangs}</div>
              </div>
              <button 
                onClick={() => handleUseGadget('batarangs')}
                disabled={gadgetCounts.batarangs <= 0}
                style={{ background: 'rgba(255,204,0,0.05)', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--accent-yellow)', fontSize: '0.7rem', padding: '0.3rem 0.6rem', cursor: 'pointer' }}
              >
                Fire 🎯
              </button>
            </div>

            {/* Grapple Gun */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Grapple Gun</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Charge: {gadgetCounts.grapple_charge}%</div>
              </div>
              <button 
                onClick={() => handleUseGadget('grapple_charge')}
                disabled={gadgetCounts.grapple_charge <= 0}
                style={{ background: 'rgba(255,204,0,0.05)', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--accent-yellow)', fontSize: '0.7rem', padding: '0.3rem 0.6rem', cursor: 'pointer' }}
              >
                Hook ⚡
              </button>
            </div>

            {/* Smoke Pellets */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Smoke Bombs</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Count: {gadgetCounts.smoke_pellets}</div>
              </div>
              <button 
                onClick={() => handleUseGadget('smoke_pellets')}
                disabled={gadgetCounts.smoke_pellets <= 0}
                style={{ background: 'rgba(255,204,0,0.05)', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--accent-yellow)', fontSize: '0.7rem', padding: '0.3rem 0.6rem', cursor: 'pointer' }}
              >
                Deploy 💨
              </button>
            </div>

            <button 
              onClick={handleReplenishGadgets}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed var(--border-glass)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                padding: '0.4rem',
                cursor: 'pointer',
                marginTop: '0.25rem'
              }}
            >
              Replenish Arsenal 📦
            </button>
          </div>
        </div>

        {/* Mock market quotes ticker */}
        <div className="tactical-card">
          <h3>Market Asset Index</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>WAYN (Wayne Ent.)</span>
              <span style={{ color: '#00ff00', fontWeight: 'bold' }}>${stockQuotes.WAYN}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>GOTH (Gotham City Bond)</span>
              <span style={{ color: '#ff4444', fontWeight: 'bold' }}>${stockQuotes.GOTH}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>ARKM (Arkham Corp)</span>
              <span style={{ color: '#00ff00', fontWeight: 'bold' }}>${stockQuotes.ARKM}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
