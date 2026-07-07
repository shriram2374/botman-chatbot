'use client';

import { useState, useEffect, use } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function SharePage({ params }) {
  // Unwrap params using React.use()
  const { chatId } = use(params);

  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSharedChat = async () => {
      try {
        if (!chatId) return;

        // Fetch chat data (only succeeds if is_shared is true due to RLS)
        const { data: chatData, error: chatErr } = await supabase
          .from('chats')
          .select('*')
          .eq('id', chatId)
          .single();

        if (chatErr) throw chatErr;
        setChat(chatData);

        // Fetch messages associated with the chat
        const { data: messagesData, error: messagesErr } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: true });

        if (messagesErr) throw messagesErr;
        setMessages(messagesData || []);
      } catch (err) {
        console.error("Error loading shared log:", err);
        setError("Mission log not found or access is restricted by the creator.");
      } finally {
        setLoading(false);
      }
    };

    fetchSharedChat();
  }, [chatId]);

  const copyToClipboard = (text, e) => {
    const btn = e.target;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 2000);
    });
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
          <div key={idx} className="code-container" style={{ margin: '1rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div className="code-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
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
              // Replace spaces in prompt URL with %20 automatically
              const cleanUrl = rawUrl.replace(/\s+/g, "%20");
              const textBefore = trimmed.substring(0, trimmed.indexOf("![") !== -1 ? trimmed.indexOf("![") : urlIndex).trim();
              const textAfter = trimmed.substring(urlEnd + (trimmed[urlEnd] === ')' ? 1 : 0)).trim();

              return (
                <div key={`${idx}-${lineIdx}`} style={{ marginBottom: '1rem' }}>
                  {textBefore && <p style={{ marginBottom: '0.5rem' }}>{textBefore}</p>}
                  <div className="ai-generated-image" style={{ margin: '1rem 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.08)', background: '#09090e' }}>
                    <img 
                      src={cleanUrl} 
                      alt="AI Generated Visual" 
                      style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', display: 'block' }}
                      loading="lazy"
                    />
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

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: '#060609',
        color: '#ffcc00',
        fontFamily: 'var(--font-sans)'
      }}>
        <span style={{ fontSize: '0.9rem', letterSpacing: '2px', fontWeight: 600 }}>RETRIEVING SHARED ARCHIVE LOG...</span>
      </div>
    );
  }

  if (error || !chat) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: '#060609',
        color: '#ff4444',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: 'var(--font-sans)'
      }}>
        <svg style={{ width: '48px', height: '48px', marginBottom: '1rem' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#fff' }}>Access Denied</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '400px', marginBottom: '1.5rem' }}>{error}</p>
        <Link href="/" style={{ background: '#ffcc00', color: '#000', border: 'none', borderRadius: '6px', padding: '0.6rem 1.2rem', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold' }}>
          Return to Uplink
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#060609', color: '#e5e7eb', fontFamily: 'var(--font-sans)' }}>
      {/* Public Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: '#0b0b10', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <div>
          <span style={{ fontSize: '0.7rem', color: '#ffcc00', letterSpacing: '2px', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>
            BATCOMPUTER ARCHIVE UPLINK (READ-ONLY)
          </span>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0, color: '#fff' }}>
            {chat.title}
          </h1>
        </div>
        <Link href="/" style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#ffcc00',
          borderRadius: '6px',
          padding: '0.5rem 1rem',
          fontSize: '0.8rem',
          fontWeight: 'bold',
          textDecoration: 'none',
          transition: 'background 0.2s'
        }}>
          Initiate New Chat ⚡
        </Link>
      </header>

      {/* Shared Chat Transcripts */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 10%' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', gap: '1rem', padding: '1rem', borderRadius: '12px', background: msg.role === 'user' ? 'rgba(255,255,255,0.01)' : 'rgba(255, 204, 0, 0.02)', border: msg.role === 'user' ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(255, 204, 0, 0.05)' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: msg.role === 'user' ? 'rgba(255,255,255,0.05)' : 'rgba(255, 204, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: msg.role === 'user' ? '#fff' : '#ffcc00',
                flexShrink: 0
              }}>
                {msg.role === 'user' ? '👤' : '🦇'}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: msg.role === 'user' ? 'var(--text-secondary)' : '#ffcc00', display: 'block', marginBottom: '0.5rem' }}>
                  {msg.role === 'user' ? 'User Agent' : 'Botman'}
                </span>
                <div className="bubble-content" style={{ fontSize: '0.92rem', lineHeight: '1.6', wordBreak: 'break-word' }}>
                  {renderFormattedMarkdown(msg.content)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Branding */}
      <footer style={{ textAlign: 'center', padding: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255, 255, 255, 0.05)', background: '#0b0b10' }}>
        Botman Network Archive. Powered by Next.js & Supabase.
      </footer>
    </div>
  );
}
