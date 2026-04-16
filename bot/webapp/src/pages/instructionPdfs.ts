import type { PlatformId } from "../../../shared/platforms";
import pdfWindows from "../assets/instructions/Инструкция Windows (2).pdf?url";
import pdfIphone from "../assets/instructions/Инструкция Айфон (2).pdf?url";
import pdfAndroid from "../assets/instructions/Инструкция Андроид.pdf?url";

/** PDF-инструкции; для остальных платформ — позже */
export const PLATFORM_INSTRUCTION_PDF: Partial<
  Record<PlatformId, { url: string; fileName: string }>
> = {
  android: { url: pdfAndroid, fileName: "MemeVPN-Android.pdf" },
  windows: { url: pdfWindows, fileName: "MemeVPN-Windows.pdf" },
  ios: { url: pdfIphone, fileName: "MemeVPN-iPhone.pdf" },
  macos: { url: pdfIphone, fileName: "MemeVPN-macOS.pdf" },
};
