"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toggleLike } from "@/lib/actions/interactions";
import { HelpContactButton } from "./HelpContactButton";
import { formatCount } from "./platform-ui";

type Notice = {
  title: string;
  message: string;
  loginHref?: string;
};

function buildLoginHref() {
  const callbackUrl = `${window.location.pathname}${window.location.search}`;
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 部分浏览器/非 HTTPS 环境下 Clipboard API 不可用，使用传统兜底。
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  }
}

export function ContentActions({
  contentId,
  title,
  text,
  href,
  likesCount = 0,
  commentsCount = 0,
  shares = 0,
  helpsCount = 0,
  isLiked = false,
  isHelped = false,
  className = "",
  showHelp = true,
  interactive = true,
}: {
  contentId: string;
  title: string;
  text?: string;
  href?: string;
  likesCount?: number;
  commentsCount?: number;
  shares?: number;
  helpsCount?: number;
  isLiked?: boolean;
  isHelped?: boolean;
  className?: string;
  showHelp?: boolean;
  interactive?: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(isLiked);
  const [likeCount, setLikeCount] = useState(likesCount);
  const [shared, setShared] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!notice?.loginHref) return;
    const timer = window.setTimeout(() => {
      router.push(notice.loginHref as string);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [notice, router]);

  const shareUrl = () => {
    if (typeof window === "undefined") return href ?? "";
    return href ? new URL(href, window.location.origin).toString() : window.location.href;
  };

  const share = async () => {
    const url = shareUrl();
    const shareData = {
      title,
      text: (text ?? "").replace(/\s+/g, " ").slice(0, 100),
      url,
    };

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        setShared(true);
        return;
      } catch (error) {
        // 用户主动取消分享时不再复制链接。
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    const copied = await copyText(url);
    if (copied) {
      setShared(true);
      setNotice({ title: "分享", message: "链接已复制，快去分享给好友吧！" });
    } else {
      setNotice({
        title: "分享",
        message: "复制失败，请手动复制浏览器地址栏中的链接。",
      });
    }
  };

  const like = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await toggleLike(contentId);
      if (!result.success) {
        if (result.requiresAuth) {
          setNotice({
            title: "请先登录",
            message: "登录后即可点赞、搭把手和发表评论，正在前往登录页…",
            loginHref: buildLoginHref(),
          });
          return;
        }
        setNotice({ title: "操作失败", message: result.error });
        return;
      }
      setLiked(result.active);
      setLikeCount(result.count);
    });
  };

  return (
    <>
      <div
        className={`feed-actions${interactive ? "" : " feed-actions-single"} ${className}`.trim()}
      >
        <button
          type="button"
          className={`feed-action${shared ? " active" : ""}`}
          onClick={share}
        >
          ↗ 分享 {formatCount(shares + (shared ? 1 : 0))}
        </button>
        {interactive && (
          <Link
            className="feed-action"
            href={`/updates/${contentId}#comments`}
            title="查看和发表评论"
          >
            💬 评论 {formatCount(commentsCount)}
          </Link>
        )}
        {interactive && (
          <button
            type="button"
            className={`feed-action${liked ? " active" : ""}`}
            onClick={like}
            disabled={pending}
            title={liked ? "取消点赞" : "点赞"}
          >
            👍 点赞 {formatCount(likeCount)}
          </button>
        )}
        {interactive && showHelp && (
          <HelpContactButton
            contentId={contentId}
            initialCount={helpsCount}
            initialHelped={isHelped}
          />
        )}
      </div>

      {notice && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={notice.title}
        >
          <div className="modal share-notice-modal">
            <div className="modal-head">
              <h2>{notice.title}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setNotice(null)}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <p>{notice.message}</p>
            {notice.loginHref ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => router.push(notice.loginHref as string)}
              >
                去登录
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setNotice(null)}
              >
                知道了
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
