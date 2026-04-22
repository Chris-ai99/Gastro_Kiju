"use client";

import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";

import { routeConfig } from "@kiju/config";
import type { Role } from "@kiju/domain";

import { useDemoApp } from "../lib/app-state";

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  waiter: "Service",
  kitchen: "Küche"
};

export const RoleSwitchPopover = () => {
  const router = useRouter();
  const { currentUser, actions } = useDemoApp();

  const openLogin = () => {
    actions.logout();
    router.push(routeConfig.login);
  };

  return (
    <div className="kiju-role-switch-popover">
      <button
        type="button"
        className="kiju-role-switch-popover__trigger"
        onClick={openLogin}
      >
        <UserCog size={18} />
        <span>Rolle wechseln</span>
        <small>{roleLabels[currentUser?.role ?? "waiter"]}</small>
      </button>
    </div>
  );
};
