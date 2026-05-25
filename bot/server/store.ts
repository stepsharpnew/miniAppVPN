const forwardedMessages = new Map<string, number>();
const FORWARD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const forwardTimestamps = new Map<string, number>();

function makeForwardKey(adminChatId: string, adminMsgId: number): string {
  return `${adminChatId}:${adminMsgId}`;
}

function evictStaleForwards(): void {
  const now = Date.now();
  for (const [key, ts] of forwardTimestamps) {
    if (now - ts > FORWARD_TTL_MS) {
      forwardTimestamps.delete(key);
      forwardedMessages.delete(key);
    }
  }
}

export function saveForwardedMessage(
  adminChatId: string,
  adminMsgId: number,
  userChatId: number
): void {
  evictStaleForwards();
  const key = makeForwardKey(adminChatId, adminMsgId);
  forwardedMessages.set(key, userChatId);
  forwardTimestamps.set(key, Date.now());
}

export function getUserChatId(
  adminChatId: string,
  adminMsgId: number
): number | undefined {
  return forwardedMessages.get(makeForwardKey(adminChatId, adminMsgId));
}

const activeDialogs = new Map<number, AdminChat>();
const DIALOG_TTL_MS = 24 * 60 * 60 * 1000;
const dialogTimestamps = new Map<number, number>();

function evictStaleDialogs(): void {
  const now = Date.now();
  for (const [userId, ts] of dialogTimestamps) {
    if (now - ts > DIALOG_TTL_MS) {
      dialogTimestamps.delete(userId);
      activeDialogs.delete(userId);
    }
  }
}

export function setActiveDialog(userChatId: number, adminChat: AdminChat): void {
  evictStaleDialogs();
  activeDialogs.set(userChatId, adminChat);
  dialogTimestamps.set(userChatId, Date.now());
}

export function getActiveDialog(userChatId: number): AdminChat | undefined {
  return activeDialogs.get(userChatId);
}

export function clearActiveDialog(userChatId: number): void {
  activeDialogs.delete(userChatId);
}

export interface AdminChat {
  chatId: string;
  topicId?: number;
}

export function resolveAdminChat(rawValue: string): AdminChat {
  const trimmed = rawValue.trim();

  const fromLink = trimmed.match(/^https?:\/\/t\.me\/c\/(\d+)(?:\/(\d+))?$/i);
  if (fromLink) {
    const chatId = `-100${fromLink[1]}`;
    const parsedTopic = fromLink[2] ? parseInt(fromLink[2], 10) : undefined;
    const topicId = parsedTopic !== undefined && parsedTopic > 1 ? parsedTopic : undefined;
    return { chatId, topicId };
  }

  if (/^\d+$/.test(trimmed)) {
    return { chatId: `-100${trimmed}` };
  }

  return { chatId: trimmed };
}
