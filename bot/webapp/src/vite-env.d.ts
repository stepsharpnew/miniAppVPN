/// <reference types="vite/client" />

interface YooMoneyCheckoutWidget {
  render(containerId?: string): Promise<void>;
  destroy(): void;
  on(event: "success" | "fail" | "complete" | "modal_close", cb: () => void): void;
}

interface YooMoneyCheckoutWidgetOptions {
  confirmation_token: string;
  return_url?: string;
  customization?: {
    modal?: boolean;
    colors?: { control_primary?: string; background?: string };
  };
  error_callback?: (error: unknown) => void;
}

declare interface Window {
  YooMoneyCheckoutWidget: new (opts: YooMoneyCheckoutWidgetOptions) => YooMoneyCheckoutWidget;
}
