import { create } from 'zustand';

interface PortalShellState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const usePortalShellStore = create<PortalShellState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
