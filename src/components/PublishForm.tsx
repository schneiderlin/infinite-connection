"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveContent, type ContentFormState } from "@/lib/actions/content";
import {
  moduleHref,
  publicInterestFields,
  type PublishModuleConfig,
  type PublishModuleSlug,
} from "@/lib/publishing";
import {
  cityDisplayName,
  composeCity,
  getAreas,
  getCities,
  provinceNames,
  resolveCityValue,
} from "@/lib/cn-divisions";

type InitialContent = {
  id: string;
  subtype: string;
  title: string;
  body: string;
  fields: string[];
  tags: string[];
  region: string;
  city: string;
  metadata: Record<string, string>;
  attachments: { id: string; fileName: string }[];
};

const initialState: ContentFormState = {};
const MAX_IMAGES = 6;
const INLINE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

type InlineImage = {
  dataUrl: string;
  mimeType: "image/jpeg" | "image/webp";
  size: number;
};

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法读取图片，请换一张试试"));
    };
    image.src = objectUrl;
  });
}

/**
 * 对象存储未配置时的兜底：缩放到最长边 1600px，必要时降低质量，
 * 控制单张图片在 3MB 以内，再以 data URL 交给 /api/uploads/inline。
 */
async function compressImageForInlineUpload(file: File): Promise<InlineImage> {
  const image = await loadImageElement(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longestSide > 1600 ? 1600 / longestSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法压缩图片，请换一张试试");

  const supportsWebp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  const mimeType: InlineImage["mimeType"] = supportsWebp ? "image/webp" : "image/jpeg";
  // 不支持 WebP 时会转成 JPEG，透明背景需要先铺白，避免变黑。
  if (!supportsWebp) {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);

  let dataUrl = canvas.toDataURL(mimeType, 0.82);
  for (const quality of [0.7, 0.6, 0.5]) {
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (Math.floor((base64.length * 3) / 4) <= INLINE_UPLOAD_MAX_BYTES) break;
    dataUrl = canvas.toDataURL(mimeType, quality);
  }

  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const size = Math.floor((base64.length * 3) / 4);
  if (size > INLINE_UPLOAD_MAX_BYTES) {
    throw new Error("图片压缩后仍超过3MB，请换一张更小的图片");
  }
  return { dataUrl, mimeType, size };
}

async function uploadInlineImage(file: File) {
  const image = await compressImageForInlineUpload(file);
  const response = await fetch("/api/uploads/inline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: image.mimeType,
      size: image.size,
      dataUrl: image.dataUrl,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "图片上传失败，请重试");
  return String(result.attachmentId);
}

function TextField({
  name,
  label,
  defaultValue,
  placeholder,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="publish-field">
      <span>{label}{required && <em>*</em>}</span>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} required={required} />
    </label>
  );
}

export function PublishForm({
  moduleSlug,
  config,
  identityName,
  identityNote,
  defaultContact,
  initial,
}: {
  moduleSlug: PublishModuleSlug;
  config: PublishModuleConfig;
  identityName: string;
  identityNote: string;
  defaultContact: { phone: string; wechat: string };
  initial?: InitialContent;
}) {
  const router = useRouter();
  const [contentId, setContentId] = useState(initial?.id ?? "");
  const [state, formAction, pending] = useActionState(async (previous: ContentFormState, formData: FormData) => {
    const result = await saveContent(previous, formData);
    if (result.contentId) setContentId(result.contentId);
    // 提交审核成功后直接回到对应模块列表，不再停留在发布表单。
    if (result.success && formData.get("intent") === "submit") {
      router.push(moduleHref[config.module]);
    }
    return result;
  }, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const actionWasPending = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const [attachments, setAttachments] = useState(initial?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const initialProvince = initial?.region ?? "";
  const initialCity = resolveCityValue(initialProvince, initial?.city ?? "");
  const [selectedRegion, setSelectedRegion] = useState(initialProvince);
  const [selectedCity, setSelectedCity] = useState(initialCity.city);
  const [selectedDistrict, setSelectedDistrict] = useState(initialCity.district);
  const [legacyCity, setLegacyCity] = useState(
    initial?.city && !initialCity.city ? initial.city : "",
  );
  const metadata = initial?.metadata ?? {};

  const cityOptions = selectedRegion ? getCities(selectedRegion) : [];
  const areaOptions = selectedRegion && selectedCity ? getAreas(selectedRegion, selectedCity) : [];
  const citySelectValue = selectedCity || (legacyCity ? "__legacy__" : "");
  const composedCity = selectedCity
    ? composeCity(selectedRegion, selectedCity, selectedDistrict)
    : legacyCity;

  useEffect(() => {
    if (pending) {
      actionWasPending.current = true;
      return;
    }
    if (!actionWasPending.current) return;
    actionWasPending.current = false;
    setIsSubmitting(false);
    setIsSavingDraft(false);
  }, [pending]);

  const showPreview = () => {
    if (!formRef.current) return;
    const values = Object.fromEntries(new FormData(formRef.current).entries());
    setPreview(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])));
  };

  const submitForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter ?? undefined);
    if (submitter instanceof HTMLButtonElement && submitter.name) {
      formData.set(submitter.name, submitter.value);
    }
    if (!formData.has("intent")) {
      formData.set("intent", "submit");
    }
    const intent = formData.get("intent") === "draft" ? "draft" : "submit";
    if (intent === "submit") {
      const region = String(formData.get("region") ?? "").trim();
      const city = String(formData.get("city") ?? "").trim();
      if (!region || !city) {
        alert("请选择省份/地区和城市后再发布。");
        return;
      }
      const body = String(formData.get("body") ?? "");
      if (/1[3-9]\d{9}/.test(body) || /\d{16,19}/.test(body)) {
        alert("正文中疑似包含手机号或银行卡号，请删除后再发布。");
        return;
      }
    }
    setIsSavingDraft(intent === "draft");
    setIsSubmitting(intent === "submit");
    startTransition(() => formAction(formData));
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((items) => items.filter((item) => item.id !== attachmentId));
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (attachments.length + files.length > MAX_IMAGES) {
      setUploadError(`每篇内容最多上传${MAX_IMAGES}张图片`);
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      for (const file of Array.from(files)) {
        const signResponse = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }),
        });
        const signed = await signResponse.json().catch(() => ({}));

        if (!signResponse.ok) {
          if (signed.code === "STORAGE_NOT_CONFIGURED" || String(signed.error ?? "").includes("对象存储尚未配置")) {
            const attachmentId = await uploadInlineImage(file);
            setAttachments((items) => [...items, { id: attachmentId, fileName: file.name }]);
            continue;
          }
          throw new Error(signed.error ?? "无法上传图片");
        }

        const uploadResponse = await fetch(signed.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadResponse.ok) throw new Error("图片上传失败，请重试");
        setAttachments((items) => [...items, { id: signed.attachmentId, fileName: file.name }]);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={submitForm} className="publish-form pc-card">
        <input type="hidden" name="moduleSlug" value={moduleSlug} />
        <input type="hidden" name="contentId" value={contentId} />
        {attachments.map((attachment) => (
          <input key={attachment.id} type="hidden" name="attachmentIds" value={attachment.id} />
        ))}

        <div className="publisher-identity">
          <span className="user-avatar">{identityName.slice(0, 1)}</span>
          <div><strong>{identityName}</strong><small>{identityNote}</small></div>
        </div>

        {(state.error || state.message) && (
          <p className={state.error ? "publish-message error" : "publish-message success"}>
            {state.error ?? state.message}
            {state.success && state.message?.includes("审核") && (
              <>
                {" "}
                <Link href="/account/content?status=PENDING_REVIEW">查看审核状态</Link>
              </>
            )}
          </p>
        )}

        <fieldset className="publish-fieldset">
          <legend>内容类型 <em>*</em></legend>
          <div className="choice-grid">
            {config.subtypes.map((subtype, index) => (
              <label key={subtype} className="choice-card">
                <input
                  type="radio"
                  name="subtype"
                  value={subtype}
                  defaultChecked={initial ? initial.subtype === subtype : index === 0}
                />
                <span>{subtype}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {moduleSlug === "funding" && (
          <fieldset className="publish-fieldset">
            <legend>发布方向 <em>*</em></legend>
            <div className="choice-grid compact">
              {["提供资源", "寻求资源"].map((direction, index) => (
                <label key={direction} className="choice-card">
                  <input type="radio" name="direction" value={direction} defaultChecked={metadata.direction ? metadata.direction === direction : index === 0} />
                  <span>{direction}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <TextField name="title" label="标题" required defaultValue={initial?.title} placeholder={`请输入${config.label}标题`} />

        <label className="publish-field">
          <span>{config.bodyLabel}<em>*</em></span>
          <textarea name="body" rows={10} required maxLength={5000} defaultValue={initial?.body} placeholder={config.bodyPlaceholder} />
        </label>

        <div className="publish-field">
          <span>图片{attachments.length > 0 && <small className="upload-count">（{attachments.length}/{MAX_IMAGES}）</small>}</span>
          <label className="upload-box">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={uploading || attachments.length >= MAX_IMAGES}
              onChange={(event) => {
                const input = event.currentTarget;
                void uploadFiles(input.files).finally(() => {
                  input.value = "";
                });
              }}
            />
            <b>{uploading ? "上传中…" : "+ 添加图片"}</b>
            <small>JPG、PNG、WebP，单张不超过10MB，最多{MAX_IMAGES}张</small>
          </label>
          {attachments.length > 0 && (
            <div className="uploaded-images">
              {attachments.map((attachment) => (
                <figure key={attachment.id} className="uploaded-image">
                  <img
                    src={`/api/uploads/${attachment.id}`}
                    alt={attachment.fileName}
                    loading="lazy"
                  />
                  <button
                    type="button"
                    className="uploaded-image-remove"
                    aria-label={`删除图片 ${attachment.fileName}`}
                    title="删除图片"
                    onClick={() => removeAttachment(attachment.id)}
                  >
                    ✕
                  </button>
                </figure>
              ))}
            </div>
          )}
          {uploadError && <small className="auth-field-error">{uploadError}</small>}
        </div>

        <fieldset className="publish-fieldset">
          <legend>领域 <em>*</em> <small>可多选</small></legend>
          <div className="field-options">
            {publicInterestFields.map((field) => (
              <label key={field}>
                <input type="checkbox" name="fields" value={field} defaultChecked={initial?.fields.includes(field)} />
                <span>{field}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="publish-row location-row">
          <label className="publish-field">
            <span>省份/地区<em>*</em></span>
            <select
              name="region"
              value={selectedRegion}
              required
              onChange={(event) => {
                setSelectedRegion(event.target.value);
                setSelectedCity("");
                setSelectedDistrict("");
                setLegacyCity("");
              }}
            >
              <option value="">请选择省份/地区</option>
              {provinceNames.map((province) => (
                <option key={province} value={province}>{province}</option>
              ))}
              {selectedRegion && !provinceNames.includes(selectedRegion) && (
                <option value={selectedRegion}>{selectedRegion}</option>
              )}
            </select>
          </label>
          <label className="publish-field">
            <span>城市<em>*</em></span>
            <select
              value={citySelectValue}
              required
              disabled={!selectedRegion}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedDistrict("");
                if (value === "__legacy__") {
                  setSelectedCity("");
                  return;
                }
                setSelectedCity(value);
                setLegacyCity("");
              }}
            >
              <option value="">{selectedRegion ? "请选择城市" : "请先选择省份/地区"}</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>{cityDisplayName(selectedRegion, city)}</option>
              ))}
              {legacyCity && <option value="__legacy__">{legacyCity}</option>}
            </select>
            <input type="hidden" name="city" value={composedCity} />
          </label>
          <label className="publish-field">
            <span>区/县</span>
            <select
              value={selectedDistrict}
              disabled={!selectedCity}
              onChange={(event) => setSelectedDistrict(event.target.value)}
            >
              <option value="">{selectedCity ? "不限 / 请选择" : "请先选择城市"}</option>
              {areaOptions.map((area) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          </label>
        </div>

        <TextField name="tags" label="话题" defaultValue={initial?.tags.join("，")} placeholder="多个话题用逗号分隔" />

        {moduleSlug === "updates" && (
          <>
            <fieldset className="publish-fieldset">
              <legend>联系方式 <em>*</em> <small>至少填写一项，仅注册用户点击“搭把手”后可见</small></legend>
              <div className="publish-row">
                <TextField name="contactPhone" label="手机号码" type="tel" defaultValue={metadata.contactPhone || defaultContact.phone} placeholder="请输入常用手机号码" />
                <TextField name="contactWechat" label="微信号" defaultValue={metadata.contactWechat || defaultContact.wechat} placeholder="请输入微信号" />
              </div>
              <small className="contact-autofill-note">保存后会绑定到账号，下次发布时自动带出，你仍可修改。</small>
            </fieldset>
            <div className="publish-row">
              <TextField name="periodStart" label="开始日期" type="date" defaultValue={metadata.periodStart} />
              <TextField name="periodEnd" label="结束日期" type="date" defaultValue={metadata.periodEnd} />
              <TextField name="relatedLinks" label="相关报道链接" defaultValue={metadata.relatedLinks} placeholder="最多5条，换行分隔" />
            </div>
          </>
        )}

        {moduleSlug === "funding" && (
          <div className="publish-specific-grid">
            <TextField name="amount" label="金额/折算价值" defaultValue={metadata.amount} placeholder="如：20万元" />
            <TextField name="validUntil" label="截止日期" type="date" defaultValue={metadata.validUntil} />
            <TextField name="applicationUrl" label="申请地址" defaultValue={metadata.applicationUrl} placeholder="官网报名页或登记表链接" />
            <TextField name="requirements" label="申请要求" defaultValue={metadata.requirements} placeholder="主体资质及其他要求" />
            <TextField name="contactName" label="联系人" defaultValue={metadata.contactName} />
            <TextField name="contactEmail" label="联系邮箱" type="email" defaultValue={metadata.contactEmail} />
            <TextField name="contactPhone" label="联系电话" defaultValue={metadata.contactPhone} />
            <TextField name="contactWechat" label="联系微信" defaultValue={metadata.contactWechat} />
          </div>
        )}

        {moduleSlug === "jobs" && (
          <div className="publish-specific-grid">
            <TextField name="headcount" label="招聘人数" type="number" defaultValue={metadata.headcount} />
            <TextField name="workMode" label="工作地点/远程" defaultValue={metadata.workMode} placeholder="如：北京朝阳 / 支持远程" />
            <TextField name="salaryMin" label="最低薪资" type="number" defaultValue={metadata.salaryMin} />
            <TextField name="salaryMax" label="最高薪资" type="number" defaultValue={metadata.salaryMax} />
            <TextField name="education" label="学历要求" defaultValue={metadata.education} placeholder="如确有必要再填写" />
            <TextField name="experience" label="经验要求" defaultValue={metadata.experience} />
            <TextField name="requirementsText" label="任职要求" defaultValue={metadata.requirementsText} />
            <TextField name="benefits" label="福利" defaultValue={metadata.benefits} />
            <TextField name="applicationEmail" label="投递邮箱" type="email" defaultValue={metadata.applicationEmail} />
            <TextField name="applicationLink" label="投递链接" defaultValue={metadata.applicationLink} />
            <TextField name="deadline" label="截止日期" type="date" defaultValue={metadata.deadline} />
          </div>
        )}

        {moduleSlug === "tools" && (
          <div className="publish-specific-grid">
            <label className="publish-field">
              <span>获取方式</span>
              <select name="priceType" defaultValue={metadata.priceType || "免费"}>
                <option>免费</option><option>商业付费</option>
              </select>
            </label>
            <TextField name="price" label="价格" defaultValue={metadata.price} placeholder="收费内容必须明示价格" />
            <TextField name="provider" label="作者/提供方" defaultValue={metadata.provider} />
            <TextField name="relatedLinks" label="相关链接" defaultValue={metadata.relatedLinks} placeholder="最多3条，换行分隔" />
            <label className="publish-confirm"><input type="checkbox" name="copyrightConfirmed" value="true" defaultChecked={metadata.copyrightConfirmed === "true"} required /> 我确认拥有内容版权或已获得合法授权</label>
          </div>
        )}

        {state.fieldErrors && (
          <div className="publish-errors">
            {Object.values(state.fieldErrors).flat().map((error) => <span key={error}>{error}</span>)}
          </div>
        )}

        <div className="publish-actions">
          <Link href="/account/content" className="btn-ghost">取消</Link>
          <button type="submit" name="intent" value="draft" className="btn-ghost" formNoValidate disabled={isSavingDraft || isSubmitting || uploading}>{isSavingDraft ? "保存中…" : "保存草稿"}</button>
          <button type="button" className="btn-ghost" onClick={showPreview}>预览</button>
          <button type="submit" name="intent" value="submit" className="btn-primary" disabled={isSubmitting || isSavingDraft || uploading}>{isSubmitting ? "提交中…" : "提交审核"}</button>
        </div>
      </form>

      {preview && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="内容预览">
          <article className="modal publish-preview">
            <div className="modal-head"><h2>内容预览</h2><button type="button" className="modal-close" onClick={() => setPreview(null)}>✕</button></div>
            <span className="tag tag-green">{preview.subtype}</span>
            <h2>{preview.title || "未填写标题"}</h2>
            <p className="preview-body">{preview.body || "未填写正文"}</p>
            <div className="card-meta">📍 {[preview.region, preview.city].filter(Boolean).join(" · ") || "全国"}</div>
          </article>
        </div>
      )}
    </>
  );
}
