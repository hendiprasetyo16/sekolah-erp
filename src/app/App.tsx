import { useEffect, useState } from 'react';
import { AppProviders } from './providers';
import { AppRouter } from '@/routes';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { ErrorBoundary } from './ErrorBoundary';

function AuthSync({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout } = useAuthStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        // Ghost Login terdeteksi
        if (isAuthenticated && !session) {
          console.warn('[AuthSync] Ghost login terdeteksi. Mereset cache...');
          logout(); // Dipanggil langsung, tanpa await
          window.location.href = '/login';
          return;
        }
      } catch (error) {
        console.error('[AuthSync] Gagal memverifikasi sesi', error);
      } finally {
        setIsReady(true);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_OUT' || !session) && isAuthenticated) {
        logout(); // Dipanggil langsung, tanpa .then()

        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [isAuthenticated, logout]);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
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