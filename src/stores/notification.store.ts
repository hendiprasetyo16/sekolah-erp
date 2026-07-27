import { create } from 'zustand';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
  link?: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [
    {
      id: '1',
      title: 'Pembayaran SPP',
      message: '15 siswa belum membayar SPP bulan Juni 2026',
      type: 'warning',
      read: false,
      createdAt: '2026-06-10T10:00:00Z',
      link: '/finance/arrears',
    },
    {
      id: '2',
      title: 'Surat Masuk Baru',
      message: 'Surat dari Dinas Pendidikan - Undangan Rapat',
      type: 'info',
      read: false,
      createdAt: '2026-06-10T09:00:00Z',
      link: '/admin/letters/incoming',
    },
    {
      id: '3',
      title: 'Jadwal Berhasil Digenerate',
      message: 'Jadwal semester genap 2025/2026 berhasil dibuat',
      type: 'success',
      read: true,
      createdAt: '2026-06-09T14:00:00Z',
      link: '/schedules/class',
    },
    {
      id: '4',
      title: 'Barang Rusak',
      message: '3 komputer di Lab Komputer 1 dilaporkan rusak',
      type: 'error',
      read: false,
      createdAt: '2026-06-09T11:00:00Z',
      link: '/inventory',
    },
  ],
  unreadCount: 3,

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      read: false,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      notifications: [newNotification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAsRead: (id) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  removeNotification: (id) => {
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));
