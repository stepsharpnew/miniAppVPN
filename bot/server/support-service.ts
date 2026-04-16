import { type Api } from "grammy";
import { addMessage, getMessages, hasMessages } from "./chat-store";
import {
  resolveAdminChat,
  saveForwardedMessage,
  setActiveDialog,
} from "./store";
import {
  SUPPORT_TICKET_ADMIN,
  SUPPORT_USER_TEXT_ADMIN,
} from "../shared/texts";

export interface SupportActor {
  dialogUserId: number;
  userName: string;
  userTag: string;
}

function getSupportAdminChat() {
  const raw = process.env.ADMIN_CHAT_ID_SUPPORT;
  if (!raw) return null;
  return resolveAdminChat(raw);
}

export function getSupportMessages(
  dialogUserId: number | string,
  after?: number,
) {
  return getMessages(dialogUserId, after);
}

export async function sendSupportTextMessage(
  api: Api,
  actor: SupportActor,
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("empty_message");
  }

  const adminChat = getSupportAdminChat();
  if (!adminChat) {
    throw new Error("support_unavailable");
  }

  const isNew = !hasMessages(actor.dialogUserId);
  const message = addMessage(actor.dialogUserId, {
    from: "user",
    type: "text",
    text: trimmed,
  });

  const adminText = isNew
    ? SUPPORT_TICKET_ADMIN(
        actor.userName,
        actor.userTag,
        actor.dialogUserId,
        trimmed,
      )
    : SUPPORT_USER_TEXT_ADMIN(
        actor.userName,
        actor.userTag,
        actor.dialogUserId,
        trimmed,
      );

  const sent = await api.sendMessage(adminChat.chatId, adminText, {
    parse_mode: "HTML",
    ...(adminChat.topicId !== undefined
      ? { message_thread_id: adminChat.topicId }
      : {}),
  });

  saveForwardedMessage(adminChat.chatId, sent.message_id, actor.dialogUserId);
  setActiveDialog(actor.dialogUserId, adminChat);

  return message;
}
