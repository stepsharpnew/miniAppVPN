import { type Context, type SessionFlavor } from "grammy";

export interface SessionData {}

export type MemeContext = Context & SessionFlavor<SessionData>;
