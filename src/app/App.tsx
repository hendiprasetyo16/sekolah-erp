import { AppProviders } from './providers';
import { AppRouter } from '@/routes';

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
