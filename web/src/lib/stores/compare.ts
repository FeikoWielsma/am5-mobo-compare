import { writable } from 'svelte/store';

const STORAGE_KEY = 'am5_compare_ids';

function createCompareStore() {
  let initial: string[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) initial = parsed;
      }
    } catch {
      initial = [];
    }
  }

  const { subscribe, set, update } = writable<string[]>(initial);

  return {
    subscribe,
    toggle: (id: string) => update(ids => {
      let next: string[];
      if (ids.includes(id)) {
        next = ids.filter(x => x !== id);
      } else {
        if (ids.length >= 10) {
          alert('You can compare a maximum of 10 motherboards at once. Please deselect a board first.');
          return ids;
        }
        next = [...ids, id];
      }
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
      }
      return next;
    }),
    add: (id: string) => update(ids => {
      if (ids.includes(id)) return ids;
      if (ids.length >= 10) {
        alert('You can compare a maximum of 10 motherboards at once. Please deselect a board first.');
        return ids;
      }
      const next = [...ids, id];
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
      }
      return next;
    }),
    remove: (id: string) => update(ids => {
      const next = ids.filter(x => x !== id);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
      }
      return next;
    }),
    clear: () => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
      }
      set([]);
    },
    set: (ids: string[]) => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
        } catch {}
      }
      set(ids);
    }
  };
}

export const compareStore = createCompareStore();

