import { useEffect, useState } from 'react';

const KEY = 'evy_worker_name';
const listeners = new Set<(name: string) => void>();

export function getWorker(): string {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setWorker(name: string) {
  try {
    localStorage.setItem(KEY, name.trim());
  } catch {
    /* prehliadač bez úložiska – meno platí len do obnovenia stránky */
  }
  listeners.forEach((l) => l(name.trim()));
}

export function askWorker(): string | undefined {
  const value = window.prompt('Zadajte svoje meno a priezvisko. Zapíše sa do protokolov a histórie chýb.', getWorker())?.trim();
  if (value) setWorker(value);
  return value || undefined;
}

/** Meno pracovníka na tomto zariadení. Ak chýba, vyžiada ho. */
export function requireWorker(): string {
  const name = getWorker() || askWorker();
  if (!name) throw new Error('Bez mena pracovníka nemožno zmenu uložiť.');
  return name;
}

export function useWorker(): string {
  const [name, setName] = useState(getWorker());
  useEffect(() => {
    listeners.add(setName);
    return () => {
      listeners.delete(setName);
    };
  }, []);
  return name;
}
