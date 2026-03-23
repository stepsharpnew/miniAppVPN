import { useMemo } from 'react';
import WebApp from '@twa-dev/sdk';

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  photoUrl: string;
}

export function useTelegramUser(): TelegramUser {
  return useMemo(() => {
    const user = WebApp.initDataUnsafe?.user;
    return {
      id: user?.id ?? 0,
      firstName: user?.first_name ?? 'User',
      lastName: user?.last_name ?? '',
      username: user?.username ?? 'username',
      photoUrl: user?.photo_url ?? '',
    };
  }, []);
}
