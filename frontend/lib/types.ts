export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data URLs
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number; // base del TTL de 12h (último mensaje)
}