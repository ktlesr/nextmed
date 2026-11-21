import { ExternalLink, FileText, Paperclip } from "lucide-react";
import type { FileMeta } from "@/lib/files";
import type { TFn } from "@/i18n";
import { LangTag } from "./badge";
import { cn } from "@/lib/cn";

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

/**
 * The two evidence slots on one record: "Türkçe Kanıt Doküman Yükle" / "İngilizce Kanıt Doküman Yükle".
 * Both are optional and visible in both interface languages; each file is stored with its own language tag.
 * Field names: fileTr, fileEn (+ linkTr, linkEn when `links` is set).
 */
export function EvidenceSlots({ t, links, multiple, labelTr, labelEn }: { t: TFn; links?: boolean; multiple?: boolean; labelTr?: string; labelEn?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(["tr", "en"] as const).map((lang) => (
        <div key={lang} className="rounded-sm border border-dashed border-line-2 p-3">
          <p className="label mb-2 flex items-center gap-2"><LangTag lang={lang} />{lang === "tr" ? labelTr ?? t("common.evidenceTr") : labelEn ?? t("common.evidenceEn")}</p>
          <input type="file" name={lang === "tr" ? "fileTr" : "fileEn"} multiple={multiple} className="control" />
          {links && <input type="url" name={lang === "tr" ? "linkTr" : "linkEn"} placeholder={t("common.orLink")} className="control mt-2 text-[0.85rem]" />}
        </div>
      ))}
    </div>
  );
}

/** Files of a record with language tags. Flags a missing language version of the requested locale. */
export function FileList({ files, t, flagMissing = true, className, compact }: { files: FileMeta[] | undefined; t: TFn; flagMissing?: boolean; className?: string; compact?: boolean }) {
  const list = files ?? [];
  const hasTr = list.some((f) => f.lang === "tr"), hasEn = list.some((f) => f.lang === "en");
  if (!list.length) return compact ? <span className="text-ink-3">—</span> : <p className={cn("text-[0.85rem] text-ink-3", className)}>{t("common.noFiles")}</p>;
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {list.map((f) => (
        <li key={f.id} className="flex min-w-0 items-center gap-2 text-[0.86rem]">
          <LangTag lang={f.lang} />
          {f.externalUrl ? (
            <a href={f.externalUrl} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-1 text-cobalt underline-offset-2 hover:underline"><ExternalLink className="size-3.5 shrink-0" /><span className="truncate">{f.name}</span></a>
          ) : (
            <a href={`/api/files/${f.id}`} className="flex min-w-0 items-center gap-1 text-cobalt underline-offset-2 hover:underline">{compact ? <Paperclip className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}<span className="truncate">{f.name}</span></a>
          )}
          {!compact && !f.externalUrl && <span className="num shrink-0 text-[0.72rem] text-ink-3">{kb(f.size)}</span>}
          {f.kind && !compact && <span className="shrink-0 text-[0.75rem] text-ink-3">· {f.kind}</span>}
        </li>
      ))}
      {flagMissing && hasTr && !hasEn && <li className="flex items-center gap-2 text-[0.8rem] text-warn"><LangTag lang="en" missing />{t("common.missingEn")}</li>}
      {flagMissing && hasEn && !hasTr && <li className="flex items-center gap-2 text-[0.8rem] text-warn"><LangTag lang="tr" missing />{t("common.missingTr")}</li>}
    </ul>
  );
}
