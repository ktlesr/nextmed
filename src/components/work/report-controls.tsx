"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Printer } from "lucide-react";
import { storeReportAction } from "@/app/app/reports/actions";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { FormMessage, SubmitButton } from "@/components/ui/form";

export function PrintButton() {
  const { t } = useT();
  return <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}><Printer className="size-3.5" />{t("reports.pdf")}</Button>;
}

/** Person picker: navigates on change. */
export function PersonPicker({ people, value, hrefBase }: { people: { id: string; name: string }[]; value: string; hrefBase: string }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <label className="flex items-center gap-2">
      <span className="label">{t("common.person")}</span>
      <select className="control h-8 w-auto py-0 text-[0.86rem]" value={value} onChange={(e) => router.push(`${hrefBase}&person=${e.target.value}`, { scroll: false })}>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}

export function StoreReportForm({ m, view, person, wp }: { m: string; view: string; person?: string | null; wp?: string | null }) {
  const { t } = useT();
  const [state, action] = useActionState(storeReportAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="m" value={m} /><input type="hidden" name="view" value={view} />
      {person && <input type="hidden" name="person" value={person} />}{wp && <input type="hidden" name="wp" value={wp} />}
      <SubmitButton size="sm"><Archive className="size-3.5" />{t("reports.store")}</SubmitButton>
      <FormMessage state={state} className="py-1" />
    </form>
  );
}
