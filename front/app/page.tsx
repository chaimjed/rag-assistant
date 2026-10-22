"use client";

import { useState, useRef, useEffect } from "react";

const API_URL = "http://127.0.0.1:8000";
const STORAGE_KEY = "rag-assistant-state";
const NO_DOC_KEY = "__general__"; // conversation quand aucun document n'est sélectionné

type Source = {
  source: string;
  excerpt: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type Doc = {
  name: string;
  chunks: number;
};

function SourcesList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div style={{ marginTop: "10px" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: "12px",
          color: "#2A6F77",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontFamily: "var(--font-body)",
        }}
      >
        {open ? "Masquer les sources" : `Voir les sources (${sources.length})`}
      </button>
      {open && (
        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {sources.map((s, i) => (
            <div
              key={i}
              style={{
                border: "1px solid #EBE7DC",
                borderLeft: "2px solid #B08D3F",
                padding: "8px 12px",
                background: "#FFFFFF",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#B08D3F", marginBottom: "4px" }}>
                {s.source}
              </div>
              <div style={{ fontSize: "13px", color: "#4A453A", lineHeight: 1.5 }}>{s.excerpt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  // Une conversation par document : { "fichier.pdf": [messages...] }
  const [conversations, setConversations] = useState<Record<string, Message[]>>({});
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeKey = activeDoc ?? NO_DOC_KEY;
  const messages = conversations[activeKey] ?? [];

  // Modifie la conversation d'un document précis (même si l'utilisateur change de document pendant le streaming)
  function updateConversation(key: string, fn: (msgs: Message[]) => Message[]) {
    setConversations((prev) => ({ ...prev, [key]: fn(prev[key] ?? []) }));
  }

  // Charger l'état sauvegardé au premier rendu
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedDocs: Doc[] = parsed.docs ?? [];
        const savedActive: string | null = parsed.activeDoc ?? null;
        let savedConvs: Record<string, Message[]> = parsed.conversations ?? {};

        // Migration de l'ancien format (une seule liste "messages") vers le nouveau
        if (parsed.messages && parsed.messages.length > 0 && !parsed.conversations) {
          savedConvs = { [savedActive ?? NO_DOC_KEY]: parsed.messages };
        }

        setDocs(savedDocs);
        setActiveDoc(savedActive);
        setConversations(savedConvs);
      }
    } catch (err) {
      // localStorage indisponible ou corrompu : on démarre à vide
    } finally {
      setHydrated(true);
    }
  }, []);

  // Synchroniser la liste avec ce qui existe vraiment dans ChromaDB (la base fait foi)
  useEffect(() => {
    if (!hydrated) return;
    fetch(`${API_URL}/documents`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((serverDocs: Doc[]) => {
        const names = new Set(serverDocs.map((d) => d.name));
        setDocs(serverDocs);
        setActiveDoc((current) =>
          current && names.has(current) ? current : serverDocs[0]?.name ?? null
        );
        // On retire les conversations des documents qui n'existent plus
        setConversations((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([k]) => k === NO_DOC_KEY || names.has(k)))
        );
      })
      .catch(() => {
        // Backend éteint : on garde la liste locale telle quelle
      });
  }, [hydrated]);

  // Sauvegarder à chaque changement
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ docs, activeDoc, conversations }));
    } catch (err) {
      // stockage plein ou indisponible : on ignore
    }
  }, [docs, activeDoc, conversations, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeKey]);

  async function handleDelete(name: string) {
    if (asking) return;
    if (!window.confirm(`Supprimer « ${name} » et sa conversation ?`)) return;
    try {
      const res = await fetch(`${API_URL}/documents/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression");
      const remaining = docs.filter((d) => d.name !== name);
      setDocs(remaining);
      setConversations((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
      if (activeDoc === name) setActiveDoc(remaining[0]?.name ?? null);
    } catch (err) {
      window.alert("Impossible de supprimer ce document. Vérifie que le serveur tourne.");
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Échec de l'upload");
      const data = await res.json();
      setDocs((prev) =>
        prev.some((d) => d.name === data.filename)
          ? prev.map((d) => (d.name === data.filename ? { ...d, chunks: data.chunks_added } : d))
          : [...prev, { name: data.filename, chunks: data.chunks_added }]
      );
      setActiveDoc(data.filename);
    } catch (err) {
      updateConversation(activeKey, (msgs) => [
        ...msgs,
        { role: "assistant", content: "Erreur : impossible d'importer ce document. Vérifie que le serveur tourne." },
      ]);
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk() {
    const q = question.trim();
    if (!q || asking) return;

    // On fige le document au moment de la question
    const key = activeKey;
    const source = activeDoc;
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

    // On ajoute la question + un message assistant vide qui va se remplir en streaming
    updateConversation(key, (msgs) => [
      ...msgs,
      { role: "user", content: q },
      { role: "assistant", content: "" },
    ]);
    setQuestion("");
    setAsking(true);

    const patchLastAssistant = (patch: (m: Message) => Message) =>
      updateConversation(key, (msgs) => {
        const copy = [...msgs];
        const last = copy.length - 1;
        if (last >= 0 && copy[last].role === "assistant") copy[last] = patch(copy[last]);
        return copy;
      });

    try {
      const res = await fetch(`${API_URL}/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, source, history }),
      });
      if (!res.ok || !res.body) throw new Error("Échec de la requête");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Le backend envoie une ligne JSON par événement (NDJSON)
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "sources") {
            patchLastAssistant((m) => ({ ...m, sources: event.sources }));
          } else if (event.type === "token") {
            patchLastAssistant((m) => ({ ...m, content: m.content + event.content }));
          }
        }
      }
    } catch (err) {
      patchLastAssistant((m) => ({
        ...m,
        content: m.content || "Erreur : impossible d'obtenir une réponse. Vérifie que le serveur tourne.",
      }));
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="grid h-screen grid-cols-[300px_1fr] bg-[#F7F5EF] text-[#1C2321] font-[family-name:var(--font-body)]">
      {/* Sidebar */}
      <aside className="flex flex-col gap-[22px] border-r border-[#DFDACC] px-[22px] py-7">
        <div>
          <h1 className="m-0 font-[family-name:var(--font-serif)] text-[22px] font-semibold tracking-tight">
            Archive
          </h1>
          <p className="mt-1 text-[13px] text-[#6B6455]">Pose des questions à tes documents</p>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`border border-[#2A6F77] px-[14px] py-[10px] text-sm text-[#2A6F77] transition-colors
            ${uploading ? "cursor-default opacity-60" : "cursor-pointer hover:bg-[#2A6F7712]"}`}
        >
          {uploading ? "Import en cours…" : "Importer un document"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />

        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {docs.length === 0 && (
            <p className="text-[13px] leading-relaxed text-[#9B9484]">
              Aucun document pour l'instant. Importe un PDF ou un fichier texte pour commencer.
            </p>
          )}
          {docs.map((doc, i) => {
            const isActive = doc.name === activeDoc;
            const count = (conversations[doc.name] ?? []).filter((m) => m.role === "user").length;
            return (
              <div
                key={doc.name}
                className={`group -mx-2 flex items-start justify-between gap-2 border-l-2 px-2
                  ${isActive ? "border-l-[#2A6F77] bg-[#2A6F7712]" : "border-l-transparent bg-transparent"}
                  ${i < docs.length - 1 ? "border-b border-b-[#EBE7DC]" : ""}`}
              >
                <button
                  onClick={() => setActiveDoc(doc.name)}
                  className="min-w-0 flex-1 cursor-pointer py-[10px] text-left"
                >
                  <div className="truncate text-[13px] font-medium text-[#1C2321]">{doc.name}</div>
                  <div className="mt-0.5 text-xs text-[#9B9484]">
                    {doc.chunks} extraits indexés
                    {count > 0 && ` · ${count} question${count > 1 ? "s" : ""}`}
                  </div>
                </button>
                <button
                  onClick={() => handleDelete(doc.name)}
                  disabled={asking}
                  className="mt-[10px] shrink-0 text-xs text-[#9B9484] opacity-0 transition-opacity hover:text-[#B3402F] focus:opacity-100 group-hover:opacity-100"
                  title="Supprimer ce document"
                >
                  Supprimer
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Chat area */}
      <main className="flex h-screen flex-col">
        {/* En-tête : document courant + bouton effacer */}
        <div className="flex items-center justify-between border-b border-[#DFDACC] px-6 py-3">
          <div className="mx-auto flex w-full max-w-[620px] items-center justify-between">
            <span className="truncate text-[13px] text-[#6B6455]">
              {activeDoc ? (
                <>
                  Conversation sur <span className="font-medium text-[#2A6F77]">{activeDoc}</span>
                </>
              ) : (
                "Aucun document sélectionné"
              )}
            </span>
            {messages.length > 0 && (
              <button
                onClick={() => updateConversation(activeKey, () => [])}
                disabled={asking}
                className="ml-4 shrink-0 text-[12px] text-[#9B9484] hover:text-[#2A6F77]"
                title="Effacer la conversation de ce document"
              >
                Effacer
              </button>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto py-10">
          <div className="mx-auto max-w-[620px] px-6">
            {messages.length === 0 && (
              <div className="mt-20 text-center">
                <p className="mb-2 font-[family-name:var(--font-serif)] text-xl text-[#4A453A]">
                  Qu'est-ce que tu veux savoir ?
                </p>
                <p className="text-sm text-[#9B9484]">
                  {activeDoc
                    ? "Pose ta première question sur ce document."
                    : "Importe un document à gauche, puis pose ta question ici."}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-6">
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                const waiting = asking && isLast && msg.role === "assistant" && msg.content === "";
                return (
                  <div key={i}>
                    <div
                      className={`mb-1.5 text-[11px] font-semibold ${
                        msg.role === "user" ? "text-[#2A6F77]" : "text-[#B08D3F]"
                      }`}
                    >
                      {msg.role === "user" ? "Toi" : "Assistant"}
                    </div>
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
                      {waiting ? <span className="text-[#9B9484]">Recherche en cours…</span> : msg.content}
                      {asking && isLast && msg.role === "assistant" && msg.content !== "" && (
                        <span className="ml-0.5 inline-block h-[14px] w-[2px] animate-pulse bg-[#B08D3F] align-middle" />
                      )}
                    </div>
                    {msg.role === "assistant" && msg.sources && <SourcesList sources={msg.sources} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Input bar */}
        <div className="border-t border-[#DFDACC] px-6 pb-5 pt-4">
          <div className="mx-auto flex max-w-[620px] items-end gap-2.5">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              placeholder="Pose ta question…"
              rows={1}
              className="flex-1 resize-none border border-[#DFDACC] bg-white px-[14px] py-3 text-sm text-[#1C2321] outline-none"
            />
            <button
              onClick={handleAsk}
              disabled={asking || !question.trim()}
              className={`bg-[#2A6F77] px-5 py-3 text-sm text-[#F7F5EF]
                ${asking || !question.trim() ? "cursor-default opacity-50" : "cursor-pointer"}`}
            >
              Envoyer
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}