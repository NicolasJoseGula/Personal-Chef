import { Conversation } from "./types";

const KEY = "personal-chef:conversations";
export const TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const all: Conversation[] = JSON.parse(raw);
    const now = Date.now();
    // TTL desde el último mensaje: borramos las que llevan >12h inactivas
    const alive = all.filter((c) => now - c.updatedAt < TTL_MS);
    if (alive.length !== all.length) saveConversations(alive);
    return alive.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(conversations));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage (¿cuota llena?)", e);
  }
}