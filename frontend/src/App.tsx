import { AppShell } from "./components/layout/AppShell";
import { SessionProvider } from "./state/useRunSession";

export default function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}
