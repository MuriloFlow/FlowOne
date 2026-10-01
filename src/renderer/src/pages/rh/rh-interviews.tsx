import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardCopy,
  Loader2,
  MessageCircle,
  NotebookPen,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  deleteInterview,
  fetchInterviewsWithContext,
  updateInterview,
} from "@/lib/rh/api";
import type { RhInterview } from "@/lib/rh/types";
import { interviewInviteMessage, openWhatsApp } from "@/lib/rh/whatsapp";
import { Dialog } from "@/components/ui/dialog";
import { RhDeleteDialog } from "./rh-delete-dialog";
import {
  RhApplicationStatusChip,
  RhCard,
  RhErrorState,
  RhField,
  RhGhostButton,
  RhPageHeader,
  RhPrimaryButton,
  RhSkeleton,
  RhTextarea,
} from "./rh-ui";

type InterviewRow = RhInterview & {
  application: {
    id: string;
    status: Parameters<typeof RhApplicationStatusChip>[0]["status"];
    job?: { title?: string } | null;
    candidate?: { full_name?: string; phone?: string } | null;
  } | null;
};

const RESULT_OPTIONS = [
  { value: "otimo", label: "Ótimo" },
  { value: "bom", label: "Bom" },
  { value: "ruim", label: "Ruim" },
  { value: "no_show", label: "Não compareceu" },
] as const;

/** Select de resultado com o MESMO menu personalizado do launcher. */
function RhResultSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const current = RESULT_OPTIONS.find((option) => option.value === value);
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        className={`flex h-7 items-center gap-1.5 rounded-[7px] border px-2.5 text-[11.5px] font-medium transition ${
          value
            ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200/90"
            : "border-white/[0.08] bg-white/[0.03] text-[#F0EFEC]/70 hover:bg-white/[0.06]"
        }`}
      >
        {current ? current.label : "Registrar resultado…"}
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-[calc(100%+4px)] right-0 z-[120] w-44 overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#151515] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl"
          >
            {RESULT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[12.5px] transition ${
                  value === option.value
                    ? "bg-white/[0.07] text-[#F0EFEC]/90"
                    : "text-[#F0EFEC]/70 hover:bg-white/[0.05]"
                }`}
              >
                {option.label}
              </button>
            ))}
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="mt-0.5 flex h-8 w-full items-center gap-2 rounded-[7px] border-t border-white/[0.06] px-2.5 text-left text-[12px] text-red-300/70 transition hover:bg-red-400/10"
              >
                Limpar resultado
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function RhInterviewsPage({
  onOpenApplication,
  authorName = "RH",
}: {
  onOpenApplication: (id: string) => void;
  authorName?: string;
}) {
  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [whatsappRow, setWhatsappRow] = useState<InterviewRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<InterviewRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await fetchInterviewsWithContext()) as InterviewRow[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar entrevistas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const now = Date.now();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const endOfDayTime = endOfDay.getTime();
    const raw = query.trim();
    const term = raw.toLowerCase();
    const filtered = rows.filter((row) => {
      if (!term) return true;
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 3 && row.application?.candidate?.phone) {
        if (row.application.candidate.phone.replace(/\D/g, "").includes(digits))
          return true;
      }
      return [
        row.application?.candidate?.full_name,
        row.application?.candidate?.phone,
        row.application?.job?.title,
        row.interviewer,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    const sorted = [...filtered].sort(
      (left, right) =>
        new Date(left.scheduled_at).getTime() -
        new Date(right.scheduled_at).getTime(),
    );
    const todayRows: InterviewRow[] = [];
    const pastRows: InterviewRow[] = [];
    const upcomingRows: InterviewRow[] = [];
    for (const row of sorted) {
      const time = new Date(row.scheduled_at).getTime();
      if (time > endOfDayTime) upcomingRows.push(row);
      else if (time >= now - 3600_000) todayRows.push(row);
      else pastRows.push(row);
    }
    return {
      upcoming: upcomingRows,
      today: todayRows,
      past: pastRows.reverse(),
    };
  }, [rows, query]);
  const { upcoming, today, past } = groups;

  async function setResult(row: InterviewRow, result: string): Promise<void> {
    await updateInterview(row.id, { result: result || null }).catch(
      () => undefined,
    );
    void load();
  }

  async function remove(row: InterviewRow): Promise<void> {
    await deleteInterview(row.id).catch(() => undefined);
    setDeletingRow(null);
    void load();
  }

  function renderRow(row: InterviewRow, compact = false): React.ReactNode {
    const onNoteSaved = () => void load();
    const when = new Date(row.scheduled_at);
    const isToday = new Date().toDateString() === when.toDateString();
    return (
      <div
        key={row.id}
        className="rounded-[14px] border border-white/[0.045] bg-[#1A1A1A] p-3.5 transition hover:border-white/[0.09]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              row.application && onOpenApplication(row.application.id)
            }
            className="min-w-0 flex-1 text-left"
          >
            <span className="flex items-center gap-2">
              <span className="truncate text-[14px] font-medium text-[#F0EFEC]/85">
                {row.application?.candidate?.full_name ?? "Candidato"}
              </span>
              {isToday ? (
                <span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-amber-200/90 uppercase">
                  hoje
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-[#F0EFEC]/38">
              {row.application?.job?.title ?? "Vaga"} ·{" "}
              {row.mode === "online" ? "Online" : "Presencial"} ·{" "}
              {row.duration_minutes} min
            </span>
            {!compact ? (
              <span className="mt-0.5 block truncate text-[11.5px] text-[#F0EFEC]/30">
                {[row.interviewer, row.location, row.meeting_url]
                  .filter(Boolean)
                  .join(" · ") || "Sem detalhes"}
              </span>
            ) : null}
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-[12.5px] tabular-nums text-[#F0EFEC]/70">
              {when.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {row.application?.candidate?.phone ? (
              <span className="text-[11px] text-[#F0EFEC]/35">
                {row.application.candidate.phone}
              </span>
            ) : null}
            {row.application ? (
              <RhApplicationStatusChip status={row.application.status} />
            ) : null}
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.04] pt-2.5">
          {row.application?.candidate?.phone ? (
            <span
              title="Abrir WhatsApp com a mensagem de confirmação pronta"
            >
              <RhPrimaryButton
                onClick={() => setWhatsappRow(row)}
                className="h-7 px-2.5 text-[12px]"
              >
                <MessageCircle className="size-3.5" /> Enviar confirmação
              </RhPrimaryButton>
            </span>
          ) : null}
          <NoteButton
            applicationId={row.application?.id ?? null}
            authorName={authorName}
            candidateName={row.application?.candidate?.full_name ?? "Candidato"}
            interviewAt={row.scheduled_at}
            onSaved={onNoteSaved}
          />
          <RhResultSelect
            value={row.result ?? ""}
            onChange={(value) => void setResult(row, value)}
          />
          <span className="flex-1" />
          {row.result ? (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-[#F0EFEC]/55 uppercase">
              {row.result}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setDeletingRow(row)}
            aria-label="Excluir entrevista"
            className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/30 transition hover:bg-red-400/10 hover:text-red-300"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RhPageHeader
        title="Entrevistas"
        subtitle="Agenda do processo seletivo — agende pela página do candidato."
      />

      {error ? (
        <RhErrorState message={error} onRetry={() => void load()} />
      ) : null}

      <div className="relative mb-3">
        <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#F0EFEC]/30" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por candidato, vaga ou entrevistador"
          className="h-9 w-full rounded-[10px] border border-white/[0.06] bg-white/[0.02] pr-3 pl-9 text-[13px] text-[#F0EFEC]/85 placeholder:text-[#F0EFEC]/30 focus:border-white/15 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          <RhSkeleton className="h-[96px]" />
          <RhSkeleton className="h-[96px]" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
          {today.length > 0 ? (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-amber-200/70 uppercase">
                Hoje ({today.length})
              </h2>
              <div className="space-y-2">
                {today.map((row) => renderRow(row))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[#F0EFEC]/45 uppercase">
              Próximas ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <RhCard className="p-5 text-center text-[12.5px] text-[#F0EFEC]/35">
                Nenhuma entrevista agendada. Agende pela página do candidato.
              </RhCard>
            ) : (
              <div className="space-y-2">
                {upcoming.map((row) => renderRow(row))}
              </div>
            )}
          </section>

          {past.length > 0 ? (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[#F0EFEC]/45 uppercase">
                Histórico ({past.length})
              </h2>
              <div className="space-y-2">
                {past.map((row) => renderRow(row, true))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <RhDeleteDialog
        open={Boolean(deletingRow)}
        title="Excluir entrevista"
        message="Excluir a entrevista de"
        highlight={deletingRow?.application?.candidate?.full_name}
        onClose={() => setDeletingRow(null)}
        onConfirm={() => {
          if (deletingRow) void remove(deletingRow);
        }}
      />

      {whatsappRow?.application?.candidate?.phone ? (
        <WhatsAppSendModal
          phone={whatsappRow.application.candidate.phone}
          candidateName={whatsappRow.application.candidate.full_name ?? "Candidato"}
          initialMessage={interviewInviteMessage({
            candidateName: whatsappRow.application.candidate.full_name ?? "candidato",
            scheduledAt: whatsappRow.scheduled_at,
            mode: whatsappRow.mode,
            address: whatsappRow.location,
            meetingUrl: whatsappRow.meeting_url,
            interviewer: whatsappRow.interviewer,
          })}
          onClose={() => setWhatsappRow(null)}
        />
      ) : null}
    </div>
  );
}

// ============================================================
// Modal de WhatsApp (igual Pré-Aprovados): mensagem editável + copiar +
// abrir WhatsApp. Usado no "Enviar confirmação" das Entrevistas.
// ============================================================

export function WhatsAppSendModal({
  phone,
  candidateName,
  initialMessage,
  onClose,
  onOpened,
}: {
  phone: string;
  candidateName: string;
  initialMessage: string;
  onClose: () => void;
  onOpened?: () => void;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [editing, setEditing] = useState(false);

  return (
    <Dialog
      open
      wide
      title="Enviar mensagem — WhatsApp"
      description={`${candidateName} · ${phone} — revise, edite se quiser e envie.`}
      onClose={onClose}
    >
      <div className="space-y-3.5 px-5 pb-5">
        <div className="relative">
          {editing ? (
            <RhTextarea
              value={message}
              onChange={setMessage}
              rows={10}
            />
          ) : (
            <pre className="max-h-64 overflow-y-auto rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#F0EFEC]/75">
              {message}
            </pre>
          )}
          <div className="absolute top-2 right-2 flex items-center gap-1">
            {!editing ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  title="Editar mensagem"
                  className="flex items-center gap-1 rounded-[7px] border border-white/[0.08] bg-[#171717]/90 px-2 py-1 text-[11px] text-[#F0EFEC]/60 transition hover:bg-white/[0.08]"
                >
                  <Pencil className="size-3" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(message)}
                  title="Copiar mensagem"
                  className="flex items-center gap-1 rounded-[7px] border border-white/[0.08] bg-[#171717]/90 px-2 py-1 text-[11px] text-[#F0EFEC]/60 transition hover:bg-white/[0.08]"
                >
                  <ClipboardCopy className="size-3" /> Copiar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-[7px] border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[11px] text-emerald-200/90 transition hover:bg-emerald-300/20"
              >
                Pronto
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <RhGhostButton onClick={onClose}>Agora não</RhGhostButton>
          <RhPrimaryButton
            onClick={() => {
              openWhatsApp(phone, message);
              onOpened?.();
              onClose();
            }}
          >
            <MessageCircle className="size-3.5" /> Abrir WhatsApp
          </RhPrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}

// ============================================================
// Adicionar observação direto da entrevista — salva nas observações
// internas do candidato (aba dele) com contexto da entrevista.
// ============================================================

function NoteButton({
  applicationId,
  candidateName,
  interviewAt,
  authorName = "RH",
  onSaved,
}: {
  applicationId: string | null;
  candidateName: string;
  interviewAt: string;
  authorName?: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (!applicationId || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { addInternalNote } = await import("@/lib/rh/api");
      const when = new Date(interviewAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      await addInternalNote(
        applicationId,
        `[Entrevista ${when}] ${content.trim()}`,
        authorName,
      );
      setContent("");
      setOpen(false);
      onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Erro ao salvar a observação.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RhGhostButton
        onClick={() => setOpen(true)}
        disabled={!applicationId}
        title="Adicionar observação ao candidato"
      >
        <NotebookPen className="size-3.5" /> Observação
      </RhGhostButton>
      {open ? (
        <Dialog
          open
          title={`Observação — ${candidateName}`}
          description="Fica registrada nas observações internas do candidato, visível só para o RH."
          onClose={() => setOpen(false)}
        >
          <div className="space-y-3.5 px-5 pb-5">
            <RhField label="Observação">
              <RhTextarea
                value={content}
                onChange={setContent}
                rows={4}
                placeholder="Como foi a entrevista, impressões, combinados…"
              />
            </RhField>
            {error ? (
              <p className="text-[12px] text-red-400/80">{error}</p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <RhGhostButton onClick={() => setOpen(false)}>
                Cancelar
              </RhGhostButton>
              <RhPrimaryButton
                onClick={() => void save()}
                disabled={saving || !content.trim()}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}{" "}
                Salvar observação
              </RhPrimaryButton>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
