// Modal de confirmação de exclusão — MESMO padrão da aba Funcionários
// (Dialog do launcher + DangerConfirmButton). Substitui window.confirm.
import { Dialog } from "@/components/ui/dialog";
import { DangerConfirmButton } from "@/components/ui/danger-confirm-button";

export function RhDeleteDialog({
  open,
  title,
  message,
  highlight,
  busy = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  /** Nome do item em destaque dentro da frase. */
  highlight?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <div className="px-5 pb-5">
        <p className="text-[13px] text-[#F0EFEC]/55">
          {message}{" "}
          {highlight ? (
            <span className="text-[#F0EFEC]/80">{highlight}</span>
          ) : null}
          ? Essa ação não tem volta.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 hover:bg-white/[0.04]"
          >
            Cancelar
          </button>
          <div className={busy ? "pointer-events-none opacity-80" : ""}>
            <DangerConfirmButton loading={busy} onClick={onConfirm}>
              {"Excluir"}
            </DangerConfirmButton>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
