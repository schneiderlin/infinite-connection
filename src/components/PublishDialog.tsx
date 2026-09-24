"use client";

import { useState } from "react";

export type PublishField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "textarea" | "select";
  options?: string[];
  required?: boolean;
};

export function PublishDialog({
  open,
  title,
  fields,
  submitLabel = "发布",
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  fields: PublishField[];
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  if (!open) return null;

  const setValue = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const canSubmit = fields.every(
    (f) => !f.required || (values[f.key] ?? "").trim().length > 0,
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {fields.map((f) => (
            <label key={f.key} className="modal-field">
              <span className="modal-label">
                {f.label}
                {f.required && <em>*</em>}
              </span>
              {f.type === "textarea" ? (
                <textarea
                  rows={4}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValue(f.key, e.target.value)}
                />
              ) : f.type === "select" ? (
                <select
                  value={values[f.key] ?? f.options?.[0] ?? ""}
                  onChange={(e) => setValue(f.key, e.target.value)}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValue(f.key, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSubmit}
            onClick={() => {
              const filled = { ...values };
              for (const f of fields) {
                if (f.type === "select" && !filled[f.key]) {
                  filled[f.key] = f.options?.[0] ?? "";
                }
              }
              onSubmit(filled);
              setValues({});
              onClose();
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
