"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/lib/actions/auth";

export function UserMenu({
  name,
  isAdmin = false,
}: {
  name: string;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="user-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="user-name">{name}</span>
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          <Link href="/account" className="user-menu-item" role="menuitem">
            账号中心
          </Link>
          <Link href="/account/content" className="user-menu-item" role="menuitem">
            内容管理
          </Link>
          {isAdmin && (
            <Link href="/admin" className="user-menu-item" role="menuitem">
              后台管理
            </Link>
          )}
          <form action={logout}>
            <button type="submit" className="user-menu-item" role="menuitem">
              退出登录
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
