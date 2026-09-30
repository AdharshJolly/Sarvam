import { AppShell } from "./components/layout/AppShell";
import { AuthProvider } from "./state/useAuth";
import { SessionProvider } from "./state/useRunSession";

export default function App() {
  return (
    <AuthProvider>
      <SessionProvider>
        <AppShell />
      </SessionProvider>
    </AuthProvider>
  );
}
