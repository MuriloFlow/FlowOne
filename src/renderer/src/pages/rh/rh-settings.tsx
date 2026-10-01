import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  createCriterion,
  createQuestion,
  deleteCriterion,
  deleteQuestion,
  fetchAiRules,
  fetchBranding,
  fetchCriteria,
  fetchQuestions,
  saveBranding,
  savePromptRules,
  prepareBrandingLogo,
  updateCriterion,
  updateQuestion,
} from "@/lib/rh/api";
import {
  QUESTION_TYPE_LABEL,
  type RhAiRule,
  type RhCriterion,
  type RhQuestion,
} from "@/lib/rh/types";
import { Dialog } from "@/components/ui/dialog";
import {
  RhCard,
  RhCheckbox,
  RhErrorState,
  RhField,
  RhGhostButton,
  RhInput,
  RhOrderedList,
  RhPageHeader,
  RhPrimaryButton,
  RhSelect,
  RhSkeleton,
} from "./rh-ui";
import { QuestionModal } from "./rh-jobs";
import { RhDeleteDialog } from "./rh-delete-dialog";

type Tab = "questions" | "criteria" | "ai" | "branding";

export function RhSettingsPage() {
  const [tab, setTab] = useState<Tab>("questions");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RhPageHeader
        title="Configurações"
        subtitle="Perguntas globais, critérios avaliativos, regras da IA e personalização do portal."
      />

      <div className="mb-4 flex gap-1">
        {(
          [
            ["questions", "Perguntas Globais"],
            ["criteria", "Critérios Avaliativos"],
            ["ai", "Regras da IA"],
            ["branding", "Personalização"],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`h-8 rounded-[8px] px-3 text-[12.5px] font-medium transition ${
              tab === value
                ? "bg-[#F0EFEC] text-[#111111]"
                : "border border-white/[0.07] text-[#F0EFEC]/50 hover:text-[#F0EFEC]/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {tab === "questions" ? <GlobalQuestions /> : null}
        {tab === "criteria" ? <CriteriaManager /> : null}
        {tab === "ai" ? <AiRulesManager /> : null}
        {tab === "branding" ? <BrandingManager /> : null}
      </div>
    </div>
  );
}

// ============================================================
// Perguntas globais — lista reordenável + CRUD em modal
// ============================================================

function GlobalQuestions() {
  const [questions, setQuestions] = useState<RhQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<RhQuestion | null>(
    null,
  );
  const [modal, setModal] = useState<
    { mode: "create" } | { mode: "edit"; question: RhQuestion } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchQuestions();
      setQuestions(
        all
          .filter((question) => question.scope === "GLOBAL")
          .sort((left, right) => left.order_index - right.order_index),
      );
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar perguntas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function move(from: number, to: number): void {
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setQuestions(next);
    void Promise.all(
      next.map((question, index) =>
        updateQuestion(question.id, { order_index: index }).catch(
          () => undefined,
        ),
      ),
    ).then(() => undefined);
  }

  async function remove(question: RhQuestion): Promise<void> {
    await deleteQuestion(question.id).catch(() => undefined);
    setDeletingQuestion(null);
    void load();
  }

  async function toggle(question: RhQuestion): Promise<void> {
    await updateQuestion(question.id, { active: !question.active }).catch(
      () => undefined,
    );
    void load();
  }

  if (loading) return <RhSkeleton className="h-[320px]" />;
  if (error)
    return <RhErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-[#F0EFEC]/40">
          Ordem = posição no formulário público. Perguntas específicas de cada
          vaga entram depois destas.
        </p>
        <RhPrimaryButton onClick={() => setModal({ mode: "create" })}>
          <Plus className="size-3.5" /> Nova pergunta
        </RhPrimaryButton>
      </div>

      {questions.length === 0 ? (
        <RhCard className="p-6 text-center text-[13px] text-[#F0EFEC]/35">
          Nenhuma pergunta global ainda.
        </RhCard>
      ) : (
        <RhOrderedList
          items={questions}
          onMove={move}
          onRemove={(question) => setDeletingQuestion(question)}
          render={(question) => (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#F0EFEC]/82">
                {question.label}
              </span>
              <span className="shrink-0 text-[11px] text-[#F0EFEC]/32">
                {QUESTION_TYPE_LABEL[question.type]} ·{" "}
                {question.required ? "obrigatória" : "opcional"}
                {question.options?.length
                  ? ` · ${question.options.length} opções`
                  : ""}
              </span>
              <button
                type="button"
                onClick={() => setModal({ mode: "edit", question })}
                aria-label="Editar pergunta"
                className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[#F0EFEC]/35 transition hover:bg-white/[0.06] hover:text-[#F0EFEC]/80"
              >
                <Pencil className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => void toggle(question)}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold tracking-wide uppercase transition ${
                  question.active
                    ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200/90"
                    : "border-white/10 bg-white/[0.05] text-[#F0EFEC]/45"
                }`}
              >
                {question.active ? "ativa" : "off"}
              </button>
            </div>
          )}
        />
      )}

      {modal?.mode === "create" ? (
        <QuestionModal
          open
          title="Nova pergunta global"
          onClose={() => setModal(null)}
          onSubmit={async (input) => {
            await createQuestion({ ...input, scope: "GLOBAL", job_id: null });
            void load();
          }}
        />
      ) : null}

      <RhDeleteDialog
        open={Boolean(deletingQuestion)}
        title="Excluir pergunta global"
        message="Excluir a pergunta"
        highlight={deletingQuestion?.label}
        onClose={() => setDeletingQuestion(null)}
        onConfirm={() => {
          if (deletingQuestion) void remove(deletingQuestion);
        }}
      />
      {modal?.mode === "edit" ? (
        <QuestionModal
          open
          title="Editar pergunta"
          initial={{
            label: modal.question.label,
            type: modal.question.type,
            required: modal.question.required,
            help_text: modal.question.help_text,
            options: modal.question.options ?? [],
            true_points: (
              modal.question.options as { true_points?: number } | null
            )?.true_points,
          }}
          onClose={() => setModal(null)}
          onSubmit={async (input) => {
            await updateQuestion(modal.question.id, input);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

// ============================================================
// Critérios avaliativos — CRUD em modal
// ============================================================

function CriteriaManager() {
  const [criteria, setCriteria] = useState<RhCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingCriterion, setDeletingCriterion] = useState<RhCriterion | null>(
    null,
  );
  const [modal, setModal] = useState<
    { mode: "create" } | { mode: "edit"; criterion: RhCriterion } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCriteria(await fetchCriteria());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar critérios.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <RhSkeleton className="h-[240px]" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-[#F0EFEC]/40">
          Usados pela IA e pelo RH na triagem. Critérios eliminatórios
          desclassificam na análise.
        </p>
        <RhPrimaryButton onClick={() => setModal({ mode: "create" })}>
          <Plus className="size-3.5" /> Novo critério
        </RhPrimaryButton>
      </div>
      {error ? (
        <RhErrorState message={error} onRetry={() => void load()} />
      ) : null}

      {criteria.length === 0 ? (
        <RhCard className="p-6 text-center text-[13px] text-[#F0EFEC]/35">
          Nenhum critério cadastrado ainda.
        </RhCard>
      ) : (
        <div className="space-y-1.5">
          {criteria.map((criterion) => (
            <div
              key={criterion.id}
              className="flex items-center justify-between gap-3 rounded-[10px] border border-white/[0.05] bg-white/[0.02] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] text-[#F0EFEC]/82">
                  {criterion.label}
                </p>
                <p className="text-[11px] text-[#F0EFEC]/32">
                  {criterion.kind === "DISQUALIFIER"
                    ? "Eliminatório"
                    : `+${criterion.points} pontos`}{" "}
                  · {criterion.job_id ? "específico de vaga" : "global"} ·{" "}
                  {criterion.active ? "ativo" : "inativo"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setModal({ mode: "edit", criterion })}
                  aria-label="Editar critério"
                  className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/35 transition hover:bg-white/[0.06] hover:text-[#F0EFEC]/80"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingCriterion(criterion)}
                  aria-label="Excluir critério"
                  className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/30 transition hover:bg-red-400/10 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal?.mode === "create" ? (
        <CriterionModal
          open
          title="Novo critério avaliativo"
          onClose={() => setModal(null)}
          onSubmit={async (input) => {
            await createCriterion(input);
            void load();
          }}
        />
      ) : null}
      {modal?.mode === "edit" ? (
        <CriterionModal
          open
          title="Editar critério"
          initial={modal.criterion}
          onClose={() => setModal(null)}
          onSubmit={async (input) => {
            await updateCriterion(modal.criterion.id, input);
            void load();
          }}
        />
      ) : null}

      <RhDeleteDialog
        open={Boolean(deletingCriterion)}
        title="Excluir critério"
        message="Excluir o critério"
        highlight={deletingCriterion?.label}
        onClose={() => setDeletingCriterion(null)}
        onConfirm={async () => {
          if (!deletingCriterion) return;
          await deleteCriterion(deletingCriterion.id).catch(() => undefined);
          setDeletingCriterion(null);
          void load();
        }}
      />
    </div>
  );
}

function CriterionModal({
  open,
  title,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: RhCriterion | null;
  onClose: () => void;
  onSubmit: (input: {
    kind: "SCORE" | "DISQUALIFIER";
    label: string;
    points: number;
    active?: boolean;
  }) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [points, setPoints] = useState("10");
  const [kind, setKind] = useState<"SCORE" | "DISQUALIFIER">("SCORE");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setPoints(String(initial?.points ?? 10));
    setKind(initial?.kind ?? "SCORE");
    setActive(initial?.active ?? true);
    setError(null);
  }, [open, initial]);

  async function submit(): Promise<void> {
    if (!label.trim()) {
      setError("Informe a descrição do critério.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        kind,
        label: label.trim(),
        points: Number(points) || 0,
        active,
      });
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao salvar o critério.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <div className="space-y-3.5 px-5 pb-5">
        <RhField label="Critério *">
          <RhInput
            value={label}
            onChange={setLabel}
            placeholder="Ex.: Experiência com vendas"
          />
        </RhField>
        <div className="grid grid-cols-2 gap-3">
          <RhField label="Tipo">
            <RhSelect
              value={kind}
              options={[
                { value: "SCORE", label: "Soma pontos" },
                { value: "DISQUALIFIER", label: "Eliminatório" },
              ]}
              onChange={(value) => setKind(value as "SCORE" | "DISQUALIFIER")}
            />
          </RhField>
          <RhField label="Pontos">
            <RhInput
              value={points}
              onChange={(value) => setPoints(value.replace(/[^\d-]/g, ""))}
              inputMode="numeric"
            />
          </RhField>
        </div>
        <RhCheckbox
          checked={active}
          onChange={setActive}
          label="Critério ativo"
        />
        {error ? <p className="text-[12px] text-red-400/80">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <RhGhostButton onClick={onClose}>Cancelar</RhGhostButton>
          <RhPrimaryButton onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}{" "}
            Salvar
          </RhPrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}

// ============================================================
// Regras da IA — estilo prompt: lista de instruções do RH + export .md
// ============================================================

function AiRulesManager() {
  const [rules, setRules] = useState<RhAiRule[]>([]);
  const [promptRules, setPromptRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAiRules();
      setRules(data);
      const custom = data.find(
        (rule) => rule.rule_key === "custom_prompt_rules",
      );
      const list = (custom?.config as { rules?: unknown })?.rules;
      setPromptRules(Array.isArray(list) ? (list as string[]) : []);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar regras da IA.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addRule(): Promise<void> {
    const text = newRule.trim();
    if (!text) return;
    const next = [...promptRules, text];
    setPromptRules(next);
    setNewRule("");
    setSaving(true);
    try {
      await savePromptRules(next);
      setSavedAt(new Date().toISOString());
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Erro ao salvar.",
      );
      setPromptRules(promptRules);
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(index: number): Promise<void> {
    const next = promptRules.filter((_, position) => position !== index);
    setPromptRules(next);
    setSaving(true);
    try {
      await savePromptRules(next);
      setSavedAt(new Date().toISOString());
    } finally {
      setSaving(false);
    }
  }

  async function moveRule(from: number, to: number): Promise<void> {
    if (to < 0 || to >= promptRules.length) return;
    const next = [...promptRules];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPromptRules(next);
    setSaving(true);
    try {
      await savePromptRules(next);
    } finally {
      setSaving(false);
    }
  }

  function downloadMd(): void {
    const engineRules = rules.filter(
      (rule) => rule.rule_key !== "custom_prompt_rules",
    );
    const lines: string[] = [
      "# Regras da IA — Portal do RH (FLOW)",
      "",
      `Gerado automaticamente em ${new Date().toLocaleString("pt-BR")}.`,
      "",
      "## Instruções do RH (aplicadas em toda análise)",
      "",
      ...(promptRules.length
        ? promptRules.map((rule, index) => `${index + 1}. ${rule}`)
        : ["_Nenhuma instrução adicional._"]),
      "",
      "## Motor de regras (banco de dados)",
      "",
    ];
    for (const rule of engineRules) {
      lines.push(
        `### ${rule.label} (\`${rule.rule_key}\`)`,
        "",
        "```json",
        JSON.stringify(rule.config, null, 2),
        "```",
        "",
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `regras-ia-rh-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <RhSkeleton className="h-[280px]" />;

  const DESCRIPTIONS: Record<string, string> = {
    age: "Faixas de idade e pontuação (18+ obrigatório; bloqueio automático abaixo disso).",
    experience:
      "Bônus de experiência: primeiro emprego, vendas/atendimento, permanência longa e penalidade de vínculos curtos.",
    location: "Cidades prioritárias, CPTM e política de conduções até a loja.",
    resume:
      "Palavras-chave buscadas no currículo (vendas, cursos) e limite de caracteres analisados.",
    deficiency:
      "Deficiência NÃO pontua e NÃO elimina — apenas registrada (conforme política).",
  };

  return (
    <div className="space-y-3">
      {error ? <RhErrorState message={error} /> : null}

      {/* ---- Instruções do RH (prompt) ---- */}
      <RhCard className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[15px] text-[#F0EFEC]/82">Instruções da IA</h2>
          <RhGhostButton onClick={downloadMd}>
            <Download className="size-3.5" /> Exportar .md
          </RhGhostButton>
        </div>
        <p className="mb-3 text-[12px] text-[#F0EFEC]/35">
          Escreva como se fosse um prompt. Cada instrução entra na análise de
          TODOS os candidatos — ex.: “Priorizar candidatos de Ribeirão Pires”,
          “Descontar quem não tem disponibilidade aos domingos”.
        </p>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <RhInput
              value={newRule}
              onChange={setNewRule}
              placeholder="Ex.: XXXXX — priorizar quem mora até 2 conduções da loja"
              onKeyDown={(event) => {
                if (event.key === "Enter") void addRule();
              }}
            />
          </div>
          <RhPrimaryButton
            onClick={() => void addRule()}
            disabled={saving || !newRule.trim()}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}{" "}
            Adicionar
          </RhPrimaryButton>
        </div>

        {promptRules.length === 0 ? (
          <p className="mt-3 rounded-[10px] border border-dashed border-white/[0.07] py-5 text-center text-[12px] text-[#F0EFEC]/35">
            Nenhuma instrução adicional. A IA usa só as regras do banco abaixo.
          </p>
        ) : (
          <div className="mt-3">
            <RhOrderedList
              items={promptRules.map((rule, index) => ({
                id: `rule-${index}`,
                text: rule,
                index,
              }))}
              onMove={(from, to) => void moveRule(from, to)}
              onRemove={(_, index) => void removeRule(index)}
              render={(item) => (
                <span className="block min-w-0 break-words text-[12.5px] text-[#F0EFEC]/75">
                  {item.text}
                </span>
              )}
            />
            {savedAt ? (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300/70">
                <FileText className="size-3" /> Instruções salvas — aplicadas na
                próxima análise.
              </p>
            ) : null}
          </div>
        )}
      </RhCard>

      {/* ---- Motor de regras (read-only, exporta no .md) ---- */}
      <RhCard className="p-4">
        <h2 className="mb-1 text-[15px] text-[#F0EFEC]/82">
          Motor de regras do banco
        </h2>
        <p className="mb-3 text-[12px] text-[#F0EFEC]/35">
          Regras estruturadas usadas pelo motor de triagem e incluídas no prompt
          da IA.
        </p>
        <div className="space-y-2">
          {rules
            .filter((rule) => rule.rule_key !== "custom_prompt_rules")
            .map((rule) => (
              <div
                key={rule.id}
                className="rounded-[10px] border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] text-[#F0EFEC]/82">
                      {rule.label}
                    </p>
                    <p className="text-[11px] text-[#F0EFEC]/32">
                      {DESCRIPTIONS[rule.rule_key] ?? rule.rule_key}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold uppercase ${
                      rule.active
                        ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200/90"
                        : "border-white/10 bg-white/[0.05] text-[#F0EFEC]/45"
                    }`}
                  >
                    {rule.active ? "ativa" : "inativa"}
                  </span>
                </div>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[11px] text-[#F0EFEC]/40 transition hover:text-[#F0EFEC]/65">
                    Ver JSON da regra
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-[8px] bg-[#111111] p-2.5 font-mono text-[10.5px] leading-relaxed text-[#F0EFEC]/65">
                    {JSON.stringify(rule.config, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
        </div>
      </RhCard>
    </div>
  );
}

// ============================================================
// Personalização — logo, tema e cores do portal público
// (rh.flwdesk.com/digaspi + vagas.flwdesk.com) via flow_branding.
// ============================================================

const DEFAULT_FOOTER_NOTE = "RH Inteligente by Flowdesk Brasil®";

function BrandingManager() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [primaryColor, setPrimaryColor] = useState("#2EC97E");
  const [secondaryColor, setSecondaryColor] = useState("#101014");
  const [footerNote, setFooterNote] = useState(DEFAULT_FOOTER_NOTE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const branding = await fetchBranding();
      setLogoUrl(branding.logo_url);
      setLogoPreview(null);
      setTheme(branding.theme);
      setPrimaryColor(branding.primary_color);
      setSecondaryColor(branding.secondary_color);
      setFooterNote(branding.footer_note || DEFAULT_FOOTER_NOTE);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Erro ao carregar.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function chooseLogo(file: File | null): Promise<void> {
    if (!file) return;
    setError(null);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
      });
      const prepared = await prepareBrandingLogo(dataUrl);
      setLogoPreview(prepared);
      setLogoUrl(prepared);
      setSaved(false);
    } catch (logoError) {
      setError(
        logoError instanceof Error ? logoError.message : "Erro na logo.",
      );
    }
  }

  async function submit(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await saveBranding({
        logo_url: logoUrl,
        theme,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        footer_note: footerNote.trim() || DEFAULT_FOOTER_NOTE,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Erro ao salvar.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <RhSkeleton className="h-[280px]" />;

  return (
    <div className="space-y-3">
      <RhCard className="p-4">
        <h2 className="text-[15px] text-[#F0EFEC]/82">
          Logo do portal (header e footer)
        </h2>
        <p className="mt-1 text-[12px] text-[#F0EFEC]/35">
          PNG, JPG ou WebP — aparece no topo "Faça parte do time" e no rodapé
          dos portais públicos.
        </p>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            void chooseLogo(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-[72px] w-[160px] items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-white/[0.12] bg-white/[0.02]">
            {logoPreview || logoUrl ? (
              <img
                src={logoPreview ?? signedBrandingLogoUrl(logoUrl)}
                alt="Logo"
                className="max-h-full max-w-full object-contain"
                onError={() => setLogoUrl(null)}
              />
            ) : (
              <span className="px-2 text-center text-[11px] text-[#F0EFEC]/30">
                Sem logo — usa "FLOW" como texto
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <RhGhostButton onClick={() => logoInputRef.current?.click()}>
              <Upload className="size-3.5" /> Escolher logo
            </RhGhostButton>
            {logoUrl ? (
              <RhGhostButton
                tone="danger"
                onClick={() => {
                  setLogoUrl(null);
                  setLogoPreview(null);
                }}
              >
                Remover
              </RhGhostButton>
            ) : null}
          </div>
        </div>
      </RhCard>

      <RhCard className="p-4">
        <h2 className="text-[15px] text-[#F0EFEC]/82">Aparência</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RhField
            label="Tema"            hint="Light = fundo claro (padrão); Dark = fundo escuro. Vale pros dois sites públicos.">
            <RhSelect
              value={theme}
              options={[
                { value: "light", label: "Light (claro — recomendado)" },
                { value: "dark", label: "Dark (escuro)" },
              ]}
              onChange={(value) => setTheme(value as "dark" | "light")}
            />
          </RhField>
          <RhField label="Cor primária (botões, links, destaques)">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-[8px] border border-white/[0.08] bg-white/[0.03] p-1"
              />
              <RhInput
                value={primaryColor}
                onChange={(value) => setPrimaryColor(value)}
                placeholder="#2EC97E"
                maxLength={9}
              />
            </div>
          </RhField>
          <RhField label="Cor secundária (textos e detalhes no tema claro)">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondaryColor}
                onChange={(event) => setSecondaryColor(event.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-[8px] border border-white/[0.08] bg-white/[0.03] p-1"
              />
              <RhInput
                value={secondaryColor}
                onChange={(value) => setSecondaryColor(value)}
                placeholder="#F0EFEC"
                maxLength={9}
              />
            </div>
          </RhField>
          <RhField label="Nota do rodapé">
            <RhInput
              value={footerNote}
              onChange={setFooterNote}
              maxLength={120}
            />
          </RhField>
        </div>
        <div className="mt-4 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="text-[11px] tracking-wide text-[#F0EFEC]/30 uppercase">
            Prévia
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-[#111111]"
              style={{ backgroundColor: primaryColor }}
            >
              Botão primário
            </span>
            <span
              className="rounded-[8px] border px-3 py-1.5 text-[12.5px]"
              style={{
                borderColor: `${secondaryColor}33`,
                color: secondaryColor,
              }}
            >
              Texto secundário
            </span>
            <a
              className="text-[12.5px] underline underline-offset-2"
              style={{ color: primaryColor }}
            >
              Link de exemplo
            </a>
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-[12px] text-red-300/80">{error}</p>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-3">
          {saved ? (
            <span className="text-[12px] text-emerald-300/80">
              Salvo — o portal atualiza na próxima visita.
            </span>
          ) : null}
          <RhPrimaryButton onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar
            personalização
          </RhPrimaryButton>
        </div>
      </RhCard>
    </div>
  );
}

function signedBrandingLogoUrl(path: string | null): string {
  if (!path) return "";
  // Logo nova = data URL gravado na própria flow_branding; legacy = caminho
  // do storage (mantido por compatibilidade com registros antigos).
  if (path.startsWith("data:") || path.startsWith("http")) return path;
  return `${supabaseUrlFromEnv()}/storage/v1/object/public/rh-files/${path}`;
}

function supabaseUrlFromEnv(): string {
  return (
    (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ??
    "https://flowone.db.flwdesk.com"
  ).replace(/\/$/, "");
}
