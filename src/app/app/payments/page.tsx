import { asc, desc } from "drizzle-orm";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/db";
import { expectedPayments, paymentTransfers } from "@/db/schema";
import { can, requireRole } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { listFiles } from "@/lib/files";
import { CURRENCIES, visibleFiles } from "@/lib/records";
import { fmtDate, fmtMoney, fmtPercent, pick } from "@/lib/format";
import { EmptyState, Meter, Notice, PageHeader } from "@/components/ui/layout";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, SubmitButton } from "@/components/ui/form";
import { EvidenceSlots, FileList } from "@/components/ui/evidence";
import { ActionForm } from "@/components/records/action-form";
import { BiText } from "@/components/records/parts";
import { addTransfer, deletePayment, deleteTransfer, savePayment } from "./actions";

export const metadata = { title: "Gelen Ödemeler" };
type Payment = typeof expectedPayments.$inferSelect;
const tone: Record<string, Tone> = { awaiting: "neutral", partial: "warn", received: "ok" };

export default async function PaymentsPage() {
  const user = await requireRole((u) => can.finance(u) || can.coordinate(u));
  const { t, locale } = await getT();
  const mayEdit = can.finance(user);
  const [payments, transfers] = await Promise.all([
    db.select().from(expectedPayments).orderBy(asc(expectedPayments.expectedDate), asc(expectedPayments.createdAt)),
    db.select().from(paymentTransfers).orderBy(desc(paymentTransfers.valueDate)),
  ]);
  const [basis, receipts] = await Promise.all([listFiles("payment", payments.map((p) => p.id)), listFiles("transfer", transfers.map((x) => x.id))]);
  const received = (id: string) => transfers.filter((x) => x.paymentId === id).reduce((a, x) => a + Number(x.amount), 0);
  // Status is derived, never stored: Bekleniyor / Kısmen geldi / Geldi
  const statusOf = (p: Payment) => { const r = received(p.id); return r <= 0 ? "awaiting" : r + 0.005 < Number(p.expectedAmount) ? "partial" : "received"; };
  const currencies = [...new Set(payments.map((p) => p.currency))];

  const PaymentFields = ({ p }: { p?: Payment }) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("finance.paymentKind")} required>
        <select name="kind" required className="control" defaultValue={p?.kind ?? "advance"}>{["advance", "interim", "balance"].map((k) => <option key={k} value={k}>{t(`finance.kind.${k}`)}</option>)}</select>
      </Field>
      <Field label={t("common.period")} hint={t("finance.periodHint")}><input name="period" className="control" defaultValue={p?.period ?? ""} /></Field>
      <Field label={t("finance.sender")} className="sm:col-span-2"><input name="sender" className="control" defaultValue={p?.sender ?? ""} placeholder="TREK / MA" /></Field>
      <Field label={t("finance.expectedAmount")} required><input name="expectedAmount" required inputMode="decimal" className="control num" defaultValue={p?.expectedAmount ?? ""} /></Field>
      <Field label={t("common.currency")}><select name="currency" className="control" defaultValue={p?.currency ?? "EUR"}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label={t("finance.expectedDate")}><input type="date" name="expectedDate" className="control" defaultValue={p?.expectedDate ?? ""} /></Field>
      <Field label={t("common.description")} className="sm:col-span-2"><textarea name="note" className="control min-h-16" defaultValue={p ? pick(locale, p.noteTr, p.noteEn) : ""} /></Field>
      <div className="sm:col-span-2"><p className="label mb-2">{t("finance.basisDoc")}</p><EvidenceSlots t={t} links labelTr={t("finance.basisTr")} labelEn={t("finance.basisEn")} /></div>
    </div>
  );

  return (
    <>
      <PageHeader eyebrow={t("nav.groupRecords")} title={t("nav.payments")} description={t("finance.paymentsLede")}
        actions={mayEdit && (
          <Modal trigger={<><Plus className="size-4" />{t("finance.newPayment")}</>} title={t("finance.newPayment")} side>
            <ActionForm action={savePayment} className="flex flex-col gap-4"><PaymentFields /><div><SubmitButton>{t("common.save")}</SubmitButton></div></ActionForm>
          </Modal>
        )} />
      {!mayEdit && <Notice className="mb-6">{t("finance.readOnly")}</Notice>}

      {payments.length === 0 ? <EmptyState title={t("common.empty")}>{t("finance.paymentsEmpty")}</EmptyState> : (
        <>
          {/* Expected / received / remaining, per currency */}
          <div className="mb-8 flex flex-col gap-0 border-y border-ink">
            {currencies.map((cur) => {
              const list = payments.filter((p) => p.currency === cur);
              const exp = list.reduce((a, p) => a + Number(p.expectedAmount), 0), rec = list.reduce((a, p) => a + received(p.id), 0);
              return (
                <div key={cur} className="grid grid-cols-2 items-end gap-x-6 gap-y-3 border-b border-line py-4 last:border-b-0 sm:grid-cols-[5rem_1fr_1fr_1fr_minmax(8rem,14rem)]">
                  <p className="num col-span-2 text-lg font-medium sm:col-span-1">{cur}</p>
                  <div><p className="label">{t("finance.expected")}</p><p className="num mt-1 text-[1.25rem] font-medium">{fmtMoney(locale, exp, cur)}</p></div>
                  <div><p className="label">{t("finance.received")}</p><p className="num mt-1 text-[1.25rem] font-medium text-ok">{fmtMoney(locale, rec, cur)}</p></div>
                  <div><p className="label">{t("finance.remaining")}</p><p className="num mt-1 text-[1.25rem] font-medium">{fmtMoney(locale, Math.max(0, exp - rec), cur)}</p></div>
                  <div className="col-span-2 sm:col-span-1"><p className="num mb-1.5 text-right text-[0.78rem] text-ink-2">{fmtPercent(locale, exp ? Math.min(1, rec / exp) : 0)}</p><Meter value={rec} max={exp} tone="ok" label={t("finance.received")} /></div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-5">
            {payments.map((p) => {
              const mine = transfers.filter((x) => x.paymentId === p.id), rec = received(p.id), exp = Number(p.expectedAmount), st = statusOf(p);
              return (
                <section key={p.id} className="panel">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="font-sans text-[1.02rem] font-semibold tracking-normal">{t(`finance.kind.${p.kind}`)}{p.period && <span className="font-normal text-ink-2"> · {p.period}</span>}</h2>
                        <Badge tone={tone[st]} dot>{t(`finance.pst.${st}`)}</Badge>
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-[0.82rem] text-ink-2">
                        {p.sender && <span>{t("finance.sender")}: {p.sender}</span>}
                        {p.expectedDate && <span className="num">{t("finance.expectedDate")}: {fmtDate(locale, p.expectedDate)}</span>}
                      </p>
                      {(p.noteTr || p.noteEn) && <BiText locale={locale} t={t} tr={p.noteTr} en={p.noteEn} className="mt-2 max-w-[70ch] text-[0.88rem] text-ink-2" />}
                      {(basis.get(p.id)?.length ?? 0) > 0 && <div className="mt-2.5"><p className="label mb-1">{t("finance.basisDoc")}</p><FileList files={visibleFiles(user, basis.get(p.id))} t={t} /></div>}
                    </div>
                    <div className="w-full sm:w-72">
                      <div className="num flex items-baseline justify-between gap-3"><span className="text-[1.3rem] font-medium">{fmtMoney(locale, rec, p.currency)}</span><span className="text-[0.85rem] text-ink-2">/ {fmtMoney(locale, exp, p.currency)}</span></div>
                      <Meter value={rec} max={exp} tone={st === "received" ? "ok" : "cobalt"} className="mt-2" label={t("finance.received")} />
                      <p className="num mt-1.5 text-[0.8rem] text-ink-2">{rec > exp + 0.005 ? t("finance.over", { amount: fmtMoney(locale, rec - exp, p.currency) }) : t("finance.remainingN", { amount: fmtMoney(locale, Math.max(0, exp - rec), p.currency) })}</p>
                    </div>
                  </div>
                  {mine.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="tbl">
                        <thead><tr><th className="w-36">{t("finance.valueDate")}</th><th className="r w-44">{t("common.amount")}</th><th>{t("finance.reference")}</th><th>{t("finance.receipt")}</th>{mayEdit && <th className="w-10" />}</tr></thead>
                        <tbody>
                          {mine.map((x) => (
                            <tr key={x.id}>
                              <td className="num text-[0.86rem]">{fmtDate(locale, x.valueDate)}</td>
                              <td className="r num font-medium">{fmtMoney(locale, x.amount, p.currency)}</td>
                              <td className="num text-[0.84rem] text-ink-2">{x.reference || "—"}</td>
                              <td>{can.finance(user) ? <FileList files={receipts.get(x.id)} t={t} compact flagMissing={false} /> : <span className="text-[0.82rem] text-ink-3">{(receipts.get(x.id)?.length ?? 0) > 0 ? t("finance.receiptRestricted") : "—"}</span>}
                                {can.finance(user) && !(receipts.get(x.id)?.length) && <span className="text-[0.78rem] text-warn"> {t("finance.receiptMissing")}</span>}</td>
                              {mayEdit && <td>
                                <Modal trigger={<Trash2 className="size-3.5" />} triggerVariant="ghost" triggerSize="sm" title={t("finance.deleteTransfer")} description={`${fmtDate(locale, x.valueDate)} · ${fmtMoney(locale, x.amount, p.currency)}`}>
                                  <ActionForm action={deleteTransfer} className="flex flex-col gap-4">
                                    <input type="hidden" name="id" value={x.id} />
                                    <Field label={t("common.reason")} required><textarea name="reason" required className="control min-h-16" /></Field>
                                    <div><SubmitButton variant="danger">{t("common.delete")}</SubmitButton></div>
                                  </ActionForm>
                                </Modal>
                              </td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {mayEdit && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
                      <Modal trigger={<><Plus className="size-3.5" />{t("finance.addTransfer")}</>} triggerVariant="secondary" triggerSize="sm" title={t("finance.addTransfer")} description={`${t(`finance.kind.${p.kind}`)}${p.period ? ` · ${p.period}` : ""} · ${t("finance.remainingN", { amount: fmtMoney(locale, Math.max(0, exp - rec), p.currency) })}`} wide>
                        <ActionForm action={addTransfer} className="flex flex-col gap-4">
                          <input type="hidden" name="paymentId" value={p.id} />
                          <div className="grid gap-4 sm:grid-cols-3">
                            <Field label={t("finance.valueDate")} required><input type="date" name="valueDate" required className="control" /></Field>
                            <Field label={`${t("common.amount")} (${p.currency})`} required><input name="amount" required inputMode="decimal" className="control num" /></Field>
                            <Field label={t("finance.reference")}><input name="reference" className="control num" /></Field>
                          </div>
                          <div><p className="label mb-2">{t("finance.receipt")} · {t("common.access.finance")}</p><EvidenceSlots t={t} labelTr={t("finance.receiptTr")} labelEn={t("finance.receiptEn")} /></div>
                          <div><SubmitButton>{t("common.save")}</SubmitButton></div>
                        </ActionForm>
                      </Modal>
                      <Modal trigger={<><Pencil className="size-3.5" />{t("common.edit")}</>} triggerVariant="ghost" triggerSize="sm" title={t("finance.editPayment")} side>
                        <ActionForm action={savePayment} className="flex flex-col gap-4"><input type="hidden" name="id" value={p.id} /><PaymentFields p={p} /><div><SubmitButton>{t("common.save")}</SubmitButton></div></ActionForm>
                      </Modal>
                      {mine.length === 0 && (
                        <ActionForm action={deletePayment} quiet closeOnOk={false} confirm={t("finance.confirmDeletePayment")} className="ml-auto">
                          <input type="hidden" name="id" value={p.id} /><Button variant="ghost" size="sm" className="hover:text-red" aria-label={t("common.delete")}><Trash2 className="size-3.5" /></Button>
                        </ActionForm>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
