const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type StreamEvent =
  | { type: "token"; content: string }
  | { type: "tool_start"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface OutgoingMessage {
  role: "user" | "assistant";
  content: string;
  images: string[];
}

// Lee el stream NDJSON del backend y va devolviendo cada evento.
export async function* streamChat(
  messages: OutgoingMessage[],
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`El servidor respondió ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer.trim()) as StreamEvent;
}