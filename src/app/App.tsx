// src/app/App.tsx
import { useEffect, useState } from 'react';
import { AppProviders } from './providers';
import { AppRouter } from '@/routes';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { ErrorBoundary } from './ErrorBoundary';

function AuthSync({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const currentAuth = useAuthStore.getState();

        // Ghost Login terdeteksi: store lokal masih login, tetapi sesi Supabase sudah habis
        if (currentAuth.isAuthenticated && !session) {
          console.warn('[AuthSync] Ghost login terdeteksi. Membersihkan sesi lokal...');
          await Promise.resolve(currentAuth.logout());
          if (isMounted && window.location.pathname !== '/login') {
            window.location.replace('/login');
          }
          return;
        }
      } catch (error) {
        console.error('[AuthSync] Gagal memverifikasi sesi:', error);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentAuth = useAuthStore.getState();

      if ((event === 'SIGNED_OUT' || !session) && currentAuth.isAuthenticated) {
        await Promise.resolve(currentAuth.logout());

        if (window.location.pathname !== '/login') {
          window.location.replace('/login');
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <AuthSync>
          <AppRouter />
        </AuthSync>
      </AppProviders>
    </ErrorBoundary>
  );
}