import { type ChatMessage } from "../shared/plans";

const chats = new Map<number | string, ChatMessage[]>();
/** fileId (Telegram) → dialog user id — для /api/support/file/:fileId */
const fileOwners = new Map<string, number | string>();

const CHAT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES_PER_USER = 500;

let counter = 0;

function evictStaleChats(): void {
  const now = Date.now();
  for (const [userId, messages] of chats) {
    const last = messages[messages.length - 1];
    if (last && now - last.timestamp > CHAT_TTL_MS) {
      chats.delete(userId);
    } else if (messages.length > MAX_MESSAGES_PER_USER) {
      chats.set(userId, messages.slice(-MAX_MESSAGES_PER_USER));
    }
  }
}

function nextId(): string {
  return `m_${Date.now()}_${++counter}`;
}

export function registerSupportFileOwner(
  fileId: string,
  userId: number | string,
): void {
  fileOwners.set(fileId, userId);
}

export function canAccessSupportFile(
  fileId: string,
  userId: number | string,
): boolean {
  const owner = fileOwners.get(fileId);
  return owner !== undefined && owner === userId;
}

export function addMessage(
  userId: number | string,
  msg: Omit<ChatMessage, "id" | "timestamp">,
): ChatMessage {
  evictStaleChats();
  const message: ChatMessage = { ...msg, id: nextId(), timestamp: Date.now() };
  if (!chats.has(userId)) chats.set(userId, []);
  const list = chats.get(userId)!;
  list.push(message);
  if (list.length > MAX_MESSAGES_PER_USER) {
    list.splice(0, list.length - MAX_MESSAGES_PER_USER);
  }
  if ("fileId" in msg && typeof msg.fileId === "string" && msg.fileId) {
    registerSupportFileOwner(msg.fileId, userId);
  }
  return message;
}

export function getMessages(
  userId: number | string,
  afterTimestamp?: number,
): ChatMessage[] {
  const all = chats.get(userId) ?? [];
  if (afterTimestamp) return all.filter((m) => m.timestamp > afterTimestamp);
  return [...all];
}

export function hasMessages(userId: number | string): boolean {
  return (chats.get(userId)?.length ?? 0) > 0;
}
