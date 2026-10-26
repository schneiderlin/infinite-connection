"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { addComment } from "@/lib/actions/interactions";

export function CommentForm({
  contentId,
  isAuthenticated,
  loginHref,
}: {
  contentId: string;
  isAuthenticated: boolean;
  loginHref: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const value = body.trim();
    if (!value) {
      setError("评论内容不能为空");
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await addComment(contentId, value);
      if (!result.success) {
        if (result.requiresAuth) {
          router.push(loginHref);
          return;
        }
        setError(result.error);
        return;
      }

      setBody("");
      router.refresh();
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="comment-login-prompt">
        <p>登录后即可参与评论，和发布者及其他伙伴交流。</p>
        <Link className="btn-primary" href={loginHref}>
          去登录
        </Link>
      </div>
    );
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      <textarea
        name="body"
        rows={4}
        maxLength={1000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="写下你的想法或建议…请勿填写手机号、银行卡号等敏感信息。"
        disabled={pending}
        aria-label="评论内容"
      />
      <div className="comment-form-foot">
        <span className="comment-form-count">{body.length}/1000</span>
        <button
          type="submit"
          className="btn-primary"
          disabled={pending || body.trim().length === 0}
        >
          {pending ? "发布中…" : "发表评论"}
        </button>
      </div>
      {error && (
        <p className="comment-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
