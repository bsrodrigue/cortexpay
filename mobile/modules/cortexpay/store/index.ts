import { create } from 'zustand';

interface CortexPayState {
  currentUserId: string;
  selectedCardId: string | null;
  setCurrentUserId: (id: string) => void;
  setSelectedCardId: (id: string | null) => void;
}

export const useCortexPayStore = create<CortexPayState>((set) => ({
  currentUserId: 'usr_cortex_demo',
  selectedCardId: null,
  setCurrentUserId: (id: string) => set({ currentUserId: id }),
  setSelectedCardId: (id: string | null) => set({ selectedCardId: id }),
}));
