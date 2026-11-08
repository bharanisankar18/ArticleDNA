import { useCallback } from 'react';
import { useToast } from '../components/Toast';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for when the panel doesn't have clipboard focus.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function useClipboard() {
  const toast = useToast();
  return useCallback(
    async (text: string, what = 'Copied') => {
      const ok = await copyText(text);
      toast.show(ok ? what : "Couldn't copy to the clipboard", { tone: ok ? 'ok' : 'bad' });
      return ok;
    },
    [toast],
  );
}
