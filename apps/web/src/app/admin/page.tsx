import { AdminPanel } from "../../components/admin-panel";
import { InternalAppShell } from "../../components/internal-app-shell";
import { normalizeSelfOrderPublicBaseUrl } from "@kiju/config";

export default function AdminPage() {
  const selfOrderPublicBaseUrl = normalizeSelfOrderPublicBaseUrl(
    process.env["NEXT_PUBLIC_SELF_ORDER_PUBLIC_BASE_URL"]
  );

  return (
    <InternalAppShell>
      <AdminPanel selfOrderPublicBaseUrl={selfOrderPublicBaseUrl} />
    </InternalAppShell>
  );
}
