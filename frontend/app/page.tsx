"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Sidebar from "@/components/Sidebar";
import { Conversation, Message } from "@/lib/types";
import { loadConversations, saveConversations } from "@/lib/storage";
import { streamChat, OutgoingMessage } from "@/lib/api";
import { fileToResizedDataURL } from "@/lib/image";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const makeTitle = (text: string) => {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 32 ? t.slice(0, 32) + "…" : t || "New recipe";
};

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // --- Cargar desde localStorage al montar ---
  useEffect(() => {
    const loaded = loadConversations();
    if (loaded.length > 0) {
      setConversations(loaded);
      setActiveId(loaded[0].id);
    } else {
      const fresh = newConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
    }
    setHydrated(true);
  }, []);

  // --- Persistir en cada cambio ---
  useEffect(() => {
    if (!hydrated) return;
    saveConversations(conversations.filter((c) => c.messages.length > 0));
  }, [conversations, hydrated]);

  // --- Autoscroll ---
  const active = conversations.find((c) => c.id === activeId) || null;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages, status]);

  function newConversation(): Conversation {
    const now = Date.now();
    return {
      id: uid(),
      title: "New recipe",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  function handleNew() {
    // si ya estás en un chat vacío, no crees otro
    const active = conversations.find((c) => c.id === activeId);
    if (active && active.messages.length === 0) return;

    const fresh = newConversation();
    // deja solo los chats reales + el borrador nuevo
    setConversations((prev) => [fresh, ...prev.filter((c) => c.messages.length > 0)]);
    setActiveId(fresh.id);
  }

  function handleDelete(id: string) {
    const next = conversations.filter((c) => c.id !== id);
    const reals = next.filter((c) => c.messages.length > 0);

    if (reals.length === 0) {
      const fresh = newConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
    } else {
      setConversations(next);
      if (id === activeId) setActiveId(reals[0].id);
    }
  }

  async function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite re-subir el mismo archivo
    for (const f of files) {
      try {
        const dataUrl = await fileToResizedDataURL(f);
        setImages((prev) => [...prev, dataUrl]);
      } catch {
        /* ignorar archivos inválidos */
      }
    }
  }

  // Helpers para actualizar mensajes de la conversación activa
  function patchActive(updater: (c: Conversation) => Conversation) {
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? updater(c) : c))
    );
  }

  function appendToAssistant(msgId: string, chunk: string) {
    patchActive((c) => ({
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map((m) =>
        m.id === msgId ? { ...m, content: m.content + chunk } : m
      ),
    }));
  }

  async function handleSend() {
    if (!activeId || isStreaming) return;
    const text = input.trim();
    if (!text && images.length === 0) return;

    const current = conversations.find((c) => c.id === activeId);
    if (!current) return;

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: text,
      images: images.length ? images : undefined,
    };
    const assistantId = uid();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "" };

    // Payload: historial + mensaje nuevo (sin el placeholder del asistente)
    const payload: OutgoingMessage[] = [...current.messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
      images: m.role === "user" ? m.images ?? [] : [],
    }));

    const isFirst = current.messages.length === 0;
    patchActive((c) => ({
      ...c,
      title: isFirst ? makeTitle(text || "Foto de ingredientes") : c.title,
      messages: [...c.messages, userMsg, assistantMsg],
      updatedAt: Date.now(),
    }));

    setInput("");
    setImages([]);
    setIsStreaming(true);
    setStatus(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const ev of streamChat(payload, controller.signal)) {
        if (ev.type === "tool_start") {
          setStatus("Searching for recipes online…");
        } else if (ev.type === "token") {
          setStatus(null);
          appendToAssistant(assistantId, ev.content);
        } else if (ev.type === "error") {
          appendToAssistant(assistantId, `\n\n⚠️ Error: ${ev.message}`);
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        appendToAssistant(assistantId, "\n\n⚠️ No pude conectarme al servidor.");
      }
    } finally {
      setIsStreaming(false);
      setStatus(null);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        conversations={conversations.filter((c) => c.messages.length > 0)}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNew}
        onDelete={handleDelete}
      />

      <main className="main">
        <header className="chat-header">
          <button
            className="toggle-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
            title="Show/hide panel"
          >
            ☰
          </button>
          <span>What ingredients do you have today?</span>
        </header>

        <div className="messages">
          {active && active.messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-emoji">🍅🥕🧄🧅</div>
              <h2>Hi! I'm your personal chef</h2>
              <p>
                Tell me what ingredients you have (or send me a photo), and I'll suggest some recipes for you to try.  🍳
              </p>
            </div>
          )}

          {active?.messages.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <div className="bubble">
                {m.images && m.images.length > 0 && (
                  <div className="thumbs">
                    {m.images.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="ingrediente" className="thumb" />
                    ))}
                  </div>
                )}
                {m.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: (props) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" />
                      ),
                    }}
                  >
                    {m.content || "…"}
                  </ReactMarkdown>
                ) : (
                  <span>{m.content}</span>
                )}
              </div>
            </div>
          ))}

          {status && <div className="status">{status}</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="composer">
          {images.length > 0 && (
            <div className="composer-thumbs">
              {images.map((src, i) => (
                <div key={i} className="composer-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="adjunto" />
                  <button
                    onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="composer-row">
            <label className="attach-btn" title="Subir foto de ingredientes">
              📷
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handleAttach}
              />
            </label>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ex: I have chicken, rice, and a lemon…"
              rows={1}
            />

            {isStreaming ? (
              <button className="send-btn stop" onClick={handleStop}>
                ⏹ Detener
              </button>
            ) : (
              <button className="send-btn" onClick={handleSend}>
                Send
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}