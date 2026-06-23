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
import { type UserRow } from "./db";
import { sendTelegramMessage } from "./telegram-outbound";

export interface SupportActor {
  dialogUserId: number;
  userName: string;
  userTag: string;
}

/**
 * Labels aligned with Mini App: first line bold ≈ имя, second · @username or login.
 * Uses DB telegram_nickname when set; otherwise same shape as /api/support/send
 * (first_name + @username) via getChat when possible, then login fallback.
 */
export function supportActorFromUserRow(user: UserRow): SupportActor | null {
  const tgId = user.telegram_id;
  if (tgId == null) return null;

  const nickRaw = user.telegram_nickname?.trim();
  if (nickRaw) {
    const plain = nickRaw.replace(/^@/, "");
    return {
      dialogUserId: tgId,
      userName: plain,
      userTag: `@${plain}`,
    };
  }

  const login = user.login?.trim() ?? "";
  return {
    dialogUserId: tgId,
    userName: login || "Веб-пользователь",
    userTag: login || "без логина",
  };
}

/**
 * Same labels as Mini App `/api/support/send`: first_name + @username from Telegram
 * when the Bot API can resolve the private chat; otherwise DB nickname or login.
 */
export async function resolveSupportActor(
  api: Api,
  user: UserRow,
): Promise<SupportActor | null> {
  const tgId = user.telegram_id;
  if (tgId == null) return null;

  try {
    const chat = await api.getChat(tgId);
    if (chat.type === "private" && "first_name" in chat) {
      const username =
        "username" in chat && chat.username ? chat.username : undefined;
      return {
        dialogUserId: tgId,
        userName: chat.first_name,
        userTag: username ? `@${username}` : "без @ника",
      };
    }
  } catch {
    /* user may be unreachable for getChat; use DB */
  }

  return supportActorFromUserRow(user);
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

  const sent = await sendTelegramMessage(api, adminChat.chatId, adminText, {
    parse_mode: "HTML",
    ...(adminChat.topicId !== undefined
      ? { message_thread_id: adminChat.topicId }
      : {}),
  }, "supportUserText");

  if (sent.status !== "sent") {
    throw new Error("support_outbound_skipped");
  }

  const message = addMessage(actor.dialogUserId, {
    from: "user",
    type: "text",
    text: trimmed,
  });

  saveForwardedMessage(adminChat.chatId, sent.value.message_id, actor.dialogUserId);
  setActiveDialog(actor.dialogUserId, adminChat);

  return message;
}
