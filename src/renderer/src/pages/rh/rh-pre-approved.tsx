// PRÉ-APROVADOS — candidatos com status "Contratado" entram aqui para o RH
// conduzir o onboarding: função definida pelo RH, envio do formulário de
// cadastro (Google Forms, mensagem pronta no WhatsApp) e confirmação de dados
// cadastrais (nome, CPF e RG frontal — modal no estilo Funcionários).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  ClipboardCopy,
  Loader2,
  MessageCircle,
  Search,
  Upload,
} from "lucide-react";
import {
  fetchPreApprovedApplications,
  fetchApplicationDetail,
  RH_FORM_STORE_NAME,
  updateApplicationOnboarding,
  uploadPreHireDocument,
} from "@/lib/rh/api";
import { preHireFormMessage, openWhatsApp } from "@/lib/rh/whatsapp";
import { compressAttendancePhoto } from "@/lib/attendance-photo";
import {
  type RhApplication,
} from "@/lib/rh/types";
import { formatCpf } from "../../../../shared/cpf";
import { Dialog } from "@/components/ui/dialog";
import {
  RhApplicationStatusChip,
  RhEmptyState,
  RhErrorState,
  RhField,
  RhGhostButton,
  RhInput,
  RhPageHeader,
  RhPrimaryButton,
  RhSkeleton,
} from "./rh-ui";

// ============================================================
// LISTA
// ============================================================

export function RhPreApprovedPage({
  onOpenApplication,
}: {
  onOpenApplication: (applicationId: string) => void;
}) {
  const [applications, setApplications] = useState<RhApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [formModal, setFormModal] = useState<RhApplication | null>(null);
  const [confirmModal, setConfirmModal] = useState<RhApplication | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApplications(await fetchPreApprovedApplications());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar pré-aprovados.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const raw = query.trim();
    const term = raw.toLowerCase();
    const digits = raw.replace(/\D/g, "");
    return applications.filter((application) => {
      if (!term) return true;
      if (digits.length >= 3 && application.candidate?.phone) {
        const phoneDigits = application.candidate.phone.replace(/\D/g, "");
        if (phoneDigits.includes(digits)) return true;
      }
      return [
        application.candidate?.full_name,
        application.candidate?.email,
        application.candidate?.cpf,
        application.job?.title,
        application.pre_hire_role,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [applications, query]);

  function patchLocal(id: string, patch: Partial<RhApplication>): void {
    setApplications((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RhPageHeader
        title="Pré-Aprovados"
        subtitle="Contratados aguardando o cadastro: envie o formulário, confirme os dados e marque cada etapa."
      />

      {error ? (
        <RhErrorState message={error} onRetry={() => void load()} />
      ) : null}

      <div className="relative mb-3">
        <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#F0EFEC]/30" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome, telefone, e-mail ou função"
          className="h-9 w-full rounded-[10px] border border-white/[0.06] bg-white/[0.02] pr-3 pl-9 text-[13px] text-[#F0EFEC]/85 placeholder:text-[#F0EFEC]/30 focus:border-white/15 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          <RhSkeleton className="h-[92px]" />
          <RhSkeleton className="h-[92px]" />
          <RhSkeleton className="h-[92px]" />
        </div>
      ) : filtered.length === 0 ? (
        <RhEmptyState
          title="Nenhum pré-aprovado por aqui"
          description='Quando você marcar uma candidatura como "Contratado", ela aparece nesta lista para o onboarding.'
        />
      ) : (
        <div className="space-y-2 pb-2">
          {filtered.map((application) => {
            const formSent = application.form_url_sent;
            const confirmed = application.data_confirmed;
            return (
              <div
                key={application.id}
                className="rounded-[14px] border border-white/[0.05] bg-white/[0.02] p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenApplication(application.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-300/10 text-[13px] font-semibold text-teal-200/80">
                      {initials(application.candidate?.full_name ?? "?")}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-[#F0EFEC]/85">
                        {application.candidate?.full_name ?? "Candidato"}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-[#F0EFEC]/38">
                        {application.pre_hire_role
                          ? `Função: ${application.pre_hire_role}`
                          : application.job?.title ?? "Vaga removida"}
                        {application.candidate?.phone
                          ? ` · ${application.candidate.phone}`
                          : ""}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <RhApplicationStatusChip status={application.status} />
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {formSent ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200/90 uppercase">
                          <BadgeCheck className="size-3" /> Formulário enviado
                        </span>
                      ) : null}
                      {confirmed ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-teal-300/20 bg-teal-300/10 px-2 py-0.5 text-[10px] font-semibold text-teal-200/90 uppercase">
                          <BadgeCheck className="size-3" /> Dados confirmados
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-3">
                  <RhPrimaryButton
                    onClick={() => setFormModal(application)}
                    className="h-7 px-2.5 text-[12px]"
                  >
                    <MessageCircle className="size-3.5" />
                    {formSent ? "Reenviar formulário" : "Enviar formulário"}
                  </RhPrimaryButton>
                  <RhGhostButton
                    onClick={() => setConfirmModal(application)}
                    className="h-7 px-2.5 text-[12px]"
                  >
                    <ClipboardCopy className="size-3.5" />
                    {confirmed ? "Ver dados confirmados" : "Confirmar dados"}
                  </RhGhostButton>
                  <RhGhostButton
                    onClick={() => onOpenApplication(application.id)}
                    className="h-7 px-2.5 text-[12px]"
                  >
                    Abrir perfil
                  </RhGhostButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formModal ? (
        <FormSendModal
          application={formModal}
          storeName={RH_FORM_STORE_NAME}
          defaultRole={
            formModal.pre_hire_role || formModal.job?.title || ""
          }
          alreadySent={Boolean(formModal.form_url_sent)}
          onClose={() => setFormModal(null)}
          onSent={() => {
            patchLocal(formModal.id, {
              form_url_sent: true,
              form_url_sent_at: new Date().toISOString(),
            });
            setFormModal(null);
            void load();
          }}
        />
      ) : null}

      {confirmModal ? (
        <DataConfirmationModal
          applicationId={confirmModal.id}
          candidateName={confirmModal.candidate?.full_name ?? "Candidato"}
          alreadyConfirmed={Boolean(confirmModal.data_confirmed)}
          onClose={() => setConfirmModal(null)}
          onSaved={(rgPath) => {
            void rgPath;
            patchLocal(confirmModal.id, { data_confirmed: true });
            setConfirmModal(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

// ============================================================
// MODAL: ENVIO DO FORMULÁRIO (WhatsApp com mensagem pronta)
// ============================================================

function FormSendModal({
  application,
  storeName,
  defaultRole,
  alreadySent,
  onClose,
  onSent,
}: {
  application: RhApplication;
  storeName: string;
  defaultRole: string;
  alreadySent: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [role, setRole] = useState(defaultRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const phone = application.candidate?.phone ?? null;
  const message = preHireFormMessage({
    candidateName: application.candidate?.full_name ?? "Candidato",
    storeName,
    role: role.trim() || "a definir",
  });

  async function openWhatsAppAndMark(): Promise<void> {
    if (!phone) {
      setError("Candidato sem telefone cadastrado — copie a mensagem abaixo.");
      setSent(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      openWhatsApp(phone, message);
      await updateApplicationOnboarding(application.id, {
        form_url_sent: true,
        form_url_sent_at: new Date().toISOString(),
      });
      onSent();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Erro ao registrar o envio.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title={
        alreadySent
          ? "Reenviar formulário de cadastro"
          : "Enviar formulário de cadastro"
      }
      description="A mensagem já vai pronta com o link do Google Forms e a Unidade/Função que a pessoa deve preencher."
      onClose={onClose}
    >
      <div className="space-y-3.5 px-5 pb-5">
        <div className="grid grid-cols-2 gap-3">
          <RhField label="Unidade">
            <RhInput value={storeName} disabled onChange={() => undefined} />
          </RhField>
          <RhField label="Função da pessoa">
            <RhInput
              value={role}
              onChange={setRole}
              placeholder="Ex.: Atendente"
              maxLength={80}
            />
          </RhField>
        </div>
        <div className="relative">
          <pre className="max-h-56 overflow-y-auto rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#F0EFEC]/75">
            {message}
          </pre>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(message)}
            title="Copiar mensagem"
            className="absolute top-2 right-2 flex items-center gap-1 rounded-[7px] border border-white/[0.08] bg-[#171717]/90 px-2 py-1 text-[11px] text-[#F0EFEC]/60 transition hover:bg-white/[0.08]"
          >
            <ClipboardCopy className="size-3" /> Copiar
          </button>
        </div>
        {error ? <p className="text-[12px] text-red-300/80">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <RhGhostButton onClick={onClose}>
            {sent ? "Fechar" : "Agora não"}
          </RhGhostButton>
          <RhPrimaryButton
            onClick={() => void openWhatsAppAndMark()}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <MessageCircle className="size-3.5" />
            )}
            {sent ? "Reabrir WhatsApp" : "Abrir WhatsApp"}
          </RhPrimaryButton>
        </div>
      </div>
    </Dialog>
  );
}

// ============================================================
// MODAL: CONFIRMAÇÃO DE DADOS (estilo Funcionários)
// ============================================================

function DataConfirmationModal({
  applicationId,
  candidateName,
  alreadyConfirmed,
  onClose,
  onSaved,
}: {
  applicationId: string;
  candidateName: string;
  alreadyConfirmed: boolean;
  onClose: () => void;
  onSaved: (rgPath: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [nameFromPortal, setNameFromPortal] = useState("");
  const [cpfFromPortal, setCpfFromPortal] = useState<string | null>(null);
  const [rgImage, setRgImage] = useState<string | null>(null);
  const [rgPathFromPortal, setRgPathFromPortal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    cpf?: string;
    rg?: string;
  }>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchApplicationDetail(applicationId)
      .then((detail) => {
        if (!active || !detail) return;
        const candidate = detail.application.candidate ?? null;
        setName(candidate?.full_name ?? "");
        setNameFromPortal(candidate?.full_name ?? "");
        setCpf(candidate?.cpf ? formatCpf(candidate.cpf) : "");
        setCpfFromPortal(candidate?.cpf ?? null);
        setRgPathFromPortal(
          detail.application.rh_files?.find((file) =>
            (file.storage_path || "").includes("onb/"),
          )?.storage_path ?? null,
        );
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Erro ao carregar o candidato.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applicationId]);

  async function chooseRg(file: File | null): Promise<void> {
    if (!file) return;
    setCompressing(true);
    setError(null);
    try {
      setRgImage(await compressAttendancePhoto(file));
      setFieldErrors((current) => ({ ...current, rg: undefined }));
    } catch (imageError) {
      setError(
        imageError instanceof Error ? imageError.message : "Erro na imagem.",
      );
    } finally {
      setCompressing(false);
    }
  }

  async function submit(): Promise<void> {
    const errors: typeof fieldErrors = {};
    if (name.trim().length < 3) errors.name = "Informe o nome completo.";
    if (cpf.replace(/\D/g, "").length !== 11)
      errors.cpf = "CPF deve ter 11 dígitos.";
    if (!rgImage && !rgPathFromPortal)
      errors.rg = "Envie a foto do RG frontal.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      let newPath: string | null = null;
      if (rgImage) {
        newPath = await uploadPreHireDocument(applicationId, rgImage);
        await registerOnboardingFile(applicationId, newPath);
      }
      await updateApplicationOnboarding(applicationId, {
        data_confirmed: true,
        pre_hire_role: undefined,
      });
      // Sincroniza o cadastro do candidato com os dados confirmados.
      await updateConfirmedCandidateData(applicationId, {
        full_name: name.trim(),
        cpf: cpf.replace(/\D/g, ""),
      });
      onSaved(newPath ?? rgPathFromPortal ?? "ok");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Erro ao salvar a confirmação.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title={`Confirmação de dados — ${candidateName}`}
      description={
        alreadyConfirmed
          ? "Dados já confirmados. Você pode revisar e salvar novamente."
          : "Confira nome, CPF e a foto do RG frontal antes de confirmar o cadastro."
      }
      onClose={onClose}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 pb-8 text-[13px] text-[#F0EFEC]/50">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="space-y-3.5 px-5 pb-5">
          <RhField label="Nome completo" required error={fieldErrors.name}>
            <RhInput
              value={name}
              onChange={(value) => {
                setName(value);
                if (fieldErrors.name)
                  setFieldErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder="Nome completo"
              error={Boolean(fieldErrors.name)}
            />
            {nameFromPortal && nameFromPortal !== name ? (
              <p className="pt-1 text-[11px] text-[#F0EFEC]/30">
                Nome do portal: {nameFromPortal}
              </p>
            ) : null}
          </RhField>

          <RhField label="CPF" required error={fieldErrors.cpf}>
            <RhInput
              value={cpf}
              onChange={(value) => {
                const digits = value.replace(/\D/g, "").slice(0, 11);
                setCpf(formatCpf(digits));
                if (fieldErrors.cpf)
                  setFieldErrors((current) => ({ ...current, cpf: undefined }));
              }}
              placeholder="000.000.000-00"
              inputMode="numeric"
              error={Boolean(fieldErrors.cpf)}
            />
            {cpfFromPortal && cpfFromPortal !== cpf.replace(/\D/g, "") ? (
              <p className="pt-1 text-[11px] text-[#F0EFEC]/30">
                CPF informado no portal: {formatCpf(cpfFromPortal)}
              </p>
            ) : null}
          </RhField>

          <RhField
            label="RG frontal (foto)"
            required
            error={fieldErrors.rg}
            hint="JPG ou PNG — a imagem é recortada e comprimida automaticamente."
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void chooseRg(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <div className="flex items-start gap-3">
              <div className="flex h-[104px] w-[150px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-white/[0.12] bg-white/[0.02]">
                {rgImage ? (
                  <img
                    src={rgImage}
                    alt="RG frontal"
                    className="size-full object-cover"
                  />
                ) : rgPathFromPortal ? (
                  <span className="px-2 text-center text-[11px] text-[#F0EFEC]/40">
                    RG já enviado neste fluxo
                  </span>
                ) : (
                  <Upload className="size-5 text-[#F0EFEC]/25" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <RhGhostButton
                  onClick={() => fileInputRef.current?.click()}
                  disabled={compressing}
                >
                  {compressing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  {rgImage ? "Trocar imagem" : "Enviar foto do RG"}
                </RhGhostButton>
                {rgImage ? (
                  <p className="text-[11px] text-emerald-300/70">
                    Imagem pronta — será enviada ao salvar.
                  </p>
                ) : null}
              </div>
            </div>
          </RhField>

          {error ? (
            <p className="text-[12px] text-red-300/80">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <RhGhostButton onClick={onClose}>Cancelar</RhGhostButton>
            <RhPrimaryButton
              onClick={() => void submit()}
              disabled={saving || compressing}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <BadgeCheck className="size-3.5" />
              )}
              Confirmar dados
            </RhPrimaryButton>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ---------- helpers locais ----------

/** Registra o arquivo do onboarding em rh_files (ligado à candidatura). */
async function registerOnboardingFile(
  applicationId: string,
  storagePath: string,
): Promise<void> {
  const { supabase } = await import("@/lib/supabase");
  const { error } = await supabase.from("rh_files").insert({
    application_id: applicationId,
    storage_path: storagePath,
    file_name: storagePath.split("/").pop() ?? "rg-frontal.jpg",
    mime_type: "image/jpeg",
    kind: "onboarding_rg",
  });
  if (error)
    throw new Error(
      `Dados confirmados, mas o RG não ficou anexado: ${error.message}`,
    );
}

/** Atualiza nome/CPF do candidato com os dados conferidos pelo RH. */
async function updateConfirmedCandidateData(
  applicationId: string,
  patch: { full_name?: string; cpf?: string },
): Promise<void> {
  const { supabase } = await import("@/lib/supabase");
  const { data: application } = await supabase
    .from("rh_applications")
    .select("candidate_id")
    .eq("id", applicationId)
    .maybeSingle();
  const candidateId = (application as { candidate_id?: string } | null)
    ?.candidate_id;
  if (!candidateId) return;
  const { error } = await supabase
    .from("rh_candidates")
    .update(patch)
    .eq("id", candidateId);
  if (error)
    throw new Error(`Não foi possível salvar os dados: ${error.message}`);
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
