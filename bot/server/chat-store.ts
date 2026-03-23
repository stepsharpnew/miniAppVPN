import { type ChatMessage } from "../shared/plans";

const chats = new Map<number, ChatMessage[]>();
let counter = 0;

function nextId(): string {
  return `m_${Date.now()}_${++counter}`;
}

export function addMessage(
  userId: number,
  msg: Omit<ChatMessage, "id" | "timestamp">,
): ChatMessage {
  const message: ChatMessage = { ...msg, id: nextId(), timestamp: Date.now() };
  if (!chats.has(userId)) chats.set(userId, []);
  chats.get(userId)!.push(message);
  return message;
}

export function getMessages(
  userId: number,
  afterTimestamp?: number,
): ChatMessage[] {
  const all = chats.get(userId) ?? [];
  if (afterTimestamp) return all.filter((m) => m.timestamp > afterTimestamp);
  return [...all];
}

export function hasMessages(userId: number): boolean {
  return (chats.get(userId)?.length ?? 0) > 0;
}
