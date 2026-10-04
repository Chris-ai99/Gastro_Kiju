import { LoginScreen } from "../components/login-screen";
import { InternalAppShell } from "../components/internal-app-shell";

export default function LoginPage() {
  return (
    <InternalAppShell>
      <LoginScreen />
    </InternalAppShell>
  );
}
