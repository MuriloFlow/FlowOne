// Preview de PDF/currículo DENTRO do FLOW — renderização via pdf.js em canvas.
// O viewer nativo do Chromium não funciona no Electron empacotado (file:// sem
// plugin de PDF = tela branca) e iframe externo é bloqueado no mobile; então
// desenhamos as páginas nós mesmos, em sequência, num container rolável.
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { loadPdfJs, type PdfDocumentProxy } from "@/lib/rh/pdf";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3;

export function RhResumePreview({
  url,
  mime,
  fileName,
  onClose,
}: {
  url: string;
  mime: string;
  fileName: string;
  onClose: () => void;
}) {
  const isPdf = mime.includes("pdf");
  const [zoom, setZoom] = useState(1);
  // Cada mudança de zoom/retry gera nova "tentativa" e reinicia o render.
  const [attempt, setAttempt] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(isPdf);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const renderTokenRef = useRef(0);

  useEffect(() => {
    if (!isPdf) return;
    const token = ++renderTokenRef.current;
    let pdf: PdfDocumentProxy | null = null;

    async function render(): Promise<void> {
      const container = pagesRef.current;
      if (!container) return;
      setLoading(true);
      setError(null);
      try {
        const pdfjs = await loadPdfJs();
        const response = await fetch(url);
        if (!response.ok) throw new Error("Não foi possível carregar o arquivo.");
        const buffer = await response.arrayBuffer();
        if (renderTokenRef.current !== token) return;
        const doc = await pdfjs.getDocument({ data: buffer }).promise;
        if (renderTokenRef.current !== token) {
          void doc.destroy();
          return;
        }
        pdf = doc;
        setPageCount(doc.numPages);

        const available = Math.max(container.clientWidth || 800, 280);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        container.replaceChildren();

        for (let number = 1; number <= doc.numPages; number += 1) {
          if (renderTokenRef.current !== token) return;
          const page = await doc.getPage(number);
          const base = page.getViewport({ scale: 1 });
          // 0.92 dá respiro nas bordas dentro do container do overlay.
          const scale = ((available * 0.92) / base.width) * zoom * dpr;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.display = "block";
          canvas.style.background = "#ffffff";
          canvas.style.boxShadow = "0 1px 12px rgba(0,0,0,0.45)";
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas indisponível neste dispositivo.");
          await page.render({ canvasContext: context, viewport }).promise;
          if (renderTokenRef.current !== token) return;
          const frame = document.createElement("div");
          frame.style.marginBottom = "14px";
          frame.appendChild(canvas);
          container.appendChild(frame);
        }
        setLoading(false);
      } catch (renderError) {
        if (renderTokenRef.current !== token) return;
        setLoading(false);
        setError(
          renderError instanceof Error
            ? renderError.message
            : "Não foi possível exibir o PDF.",
        );
      }
    }

    void render();

    return () => {
      renderTokenRef.current += 1; // invalida o render em curso
      if (pagesRef.current) pagesRef.current.replaceChildren();
      void pdf?.destroy();
    };
  }, [url, zoom, isPdf, attempt]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col rounded-[18px] bg-[#111111]/97 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <FileText className="size-4 shrink-0 text-[#F0EFEC]/45" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-[#F0EFEC]/75">
          {fileName}
          {pageCount ? (
            <span className="ml-1.5 text-[#F0EFEC]/35">· {pageCount} pág.</span>
          ) : null}
        </span>
        {isPdf ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Reduzir zoom"
              disabled={zoom <= MIN_ZOOM}
              onClick={() =>
                setZoom((current) =>
                  Math.max(MIN_ZOOM, Math.round((current - 0.2) * 10) / 10),
                )
              }
              className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/55 transition hover:bg-white/[0.06] disabled:opacity-30"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-10 text-center text-[11px] text-[#F0EFEC]/50">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Ampliar zoom"
              disabled={zoom >= MAX_ZOOM}
              onClick={() =>
                setZoom((current) =>
                  Math.min(MAX_ZOOM, Math.round((current + 0.2) * 10) / 10),
                )
              }
              className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/55 transition hover:bg-white/[0.06] disabled:opacity-30"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        ) : null}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          download={fileName}
          className="flex items-center gap-1.5 rounded-[8px] border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-[#F0EFEC]/60 transition hover:bg-white/[0.05]"
        >
          <Download className="size-3" /> Baixar
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="flex items-center gap-1.5 rounded-[8px] bg-[#F0EFEC] px-2.5 py-1 text-[11.5px] font-medium text-[#111111]"
        >
          <X className="size-3" /> Fechar
        </button>
      </div>

      {isPdf ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#191919] px-4 py-4">
          <div ref={pagesRef} className="mx-auto max-w-[900px]" />
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-[#F0EFEC]/50">
              <Loader2 className="size-4 animate-spin" />
              {pageCount
                ? `Renderizando ${pageCount} página(s)…`
                : "Abrindo PDF…"}
            </div>
          ) : null}
          {error ? (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-[12px] border border-red-500/15 bg-red-500/8 px-6 py-8 text-center">
              <AlertTriangle className="size-5 text-red-300/80" />
              <p className="text-[13px] text-red-200/85">{error}</p>
              <button
                type="button"
                onClick={() => setAttempt((current) => current + 1)}
                className="rounded-[8px] border border-white/10 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-[#F0EFEC] transition hover:bg-white/10"
              >
                Tentar novamente
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[#191919] px-6 text-center">
          <FileText className="size-8 text-[#F0EFEC]/25" />
          <p className="max-w-sm text-[13px] text-[#F0EFEC]/55">
            Pré-visualização integrada ainda não disponível para este formato
            (.doc). Baixe o arquivo para abrir no seu editor.
          </p>
          <a
            href={url}
            download={fileName}
            className="flex items-center gap-1.5 rounded-[8px] bg-[#F0EFEC] px-3 py-1.5 text-[12.5px] font-medium text-[#111111]"
          >
            <Download className="size-3.5" /> Baixar arquivo
          </a>
        </div>
      )}
    </div>
  );
}
