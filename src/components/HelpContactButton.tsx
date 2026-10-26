"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toggleHelp } from "@/lib/actions/interactions";
import { formatCount } from "./platform-ui";

type Contact = { phone: string; wechat: string };

function buildLoginHref() {
  const callbackUrl = `${window.location.pathname}${window.location.search}`;
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export function HelpContactButton({
  contentId,
  initialCount = 0,
  initialHelped = false,
}: {
  contentId: string;
  initialCount?: number;
  initialHelped?: boolean;
}) {
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [error, setError] = useState("");
  const [loginHref, setLoginHref] = useState("");
  const [loading, setLoading] = useState(false);
  const [helped, setHelped] = useState(initialHelped);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!loginHref) return;
    const timer = window.setTimeout(() => router.push(loginHref), 1200);
    return () => window.clearTimeout(timer);
  }, [loginHref, router]);

  const revealContact = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/content/${contentId}/contact`);
      if (response.status === 401) {
        setError("请先登录");
        setLoginHref(buildLoginHref());
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "无法获取联系方式");
      setContact(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法获取联系方式");
    } finally {
      setLoading(false);
    }
  };

  const handleHelp = () => {
    if (pending || loading) return;

    if (helped) {
      void revealContact();
      return;
    }

    startTransition(async () => {
      const result = await toggleHelp(contentId);
      if (!result.success) {
        setError(result.error);
        if (result.requiresAuth) setLoginHref(buildLoginHref());
        return;
      }

      setHelped(result.active);
      setCount(result.count);
      if (result.active) await revealContact();
    });
  };

  const cancelHelp = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await toggleHelp(contentId);
      if (!result.success) {
        setError(result.error);
        if (result.requiresAuth) setLoginHref(buildLoginHref());
        return;
      }

      setHelped(result.active);
      setCount(result.count);
      if (!result.active) {
        setContact(null);
        setError("");
        setLoginHref("");
      }
    });
  };

  const closeModal = () => {
    setContact(null);
    setError("");
    setLoginHref("");
  };

  const busy = pending || loading;

  return (
    <>
      <button
        type="button"
        className={`feed-action help${helped ? " active" : ""}`}
        onClick={handleHelp}
        disabled={busy}
        title={
          helped
            ? "再次查看发布者联系方式（可在弹窗中取消搭把手）"
            : "搭把手并查看发布者联系方式"
        }
      >
        🤝 {busy ? "处理中…" : `搭把手 ${formatCount(count)}`}
      </button>
      {(contact || error || loginHref) && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="搭把手与发布者联系方式"
        >
          <div className="modal contact-modal">
            <div className="modal-head">
              <h2>{error ? "搭把手" : "联系发布者"}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            {error ? (
              <p className="auth-error">{error}</p>
            ) : (
              <div className="contact-details">
                {contact?.phone && (
                  <p>
                    <span>手机号码</span>
                    <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  </p>
                )}
                {contact?.wechat && (
                  <p>
                    <span>微信号</span>
                    <strong>{contact.wechat}</strong>
                  </p>
                )}
                <small>请说明从“无限连接”看到该信息，并注意保护双方隐私。</small>
              </div>
            )}
            <div className="contact-actions">
              {helped && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={cancelHelp}
                  disabled={pending}
                >
                  {pending ? "处理中…" : "取消搭把手"}
                </button>
              )}
              {loginHref ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => router.push(loginHref)}
                >
                  去登录
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={closeModal}>
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
