import { useEffect, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';

interface UseMainButtonOptions {
  text: string;
  onClick: () => void;
  visible?: boolean;
}

export function useMainButton({ text, onClick, visible = true }: UseMainButtonOptions) {
  useEffect(() => {
    const btn = WebApp.MainButton;
    btn.setParams({
      text,
      color: '#4D8BFF',
      text_color: '#FFFFFF',
    });

    if (visible) {
      btn.show();
    } else {
      btn.hide();
    }

    return () => {
      btn.hide();
    };
  }, [text, visible]);

  useEffect(() => {
    const btn = WebApp.MainButton;
    btn.onClick(onClick);
    return () => {
      btn.offClick(onClick);
    };
  }, [onClick]);

  const hide = useCallback(() => {
    WebApp.MainButton.hide();
  }, []);

  return { hide };
}
