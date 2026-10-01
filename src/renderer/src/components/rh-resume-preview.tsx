// Preview de PDF/currículo DENTRO do FLOW — renderização via pdf.js em canvas.
// O viewer nativo do Chromium não funciona no Electron empacotado (file:// sem
// plugin de PDF = tela branca) e iframe externo é bloqueado no mobile; então
// desenhamos as páginas nós mesmos.
//
// Robustez: recebe o ArrayBuffer JÁ BAIXADO (download autenticado via
// storage.download, sem URL assinada que expira), usa cMap/standardFonts do
// CDN só quando o PDF precisa (currículos gerados por Word usam), e mantém
// o worker na main thread via globalThis.pdfjsWorker (funciona em file://,
// dev e WebView Android).
import { useCallback, useEffect, useRef, useState } from "react";
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
import { isMobileShell } from "@/lib/is-mobile-shell";
import { extractResumeTextFromBuffer } from "@/lib/rh/api";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3;
// Fontes para PDFs com CMap (currículos de WORD/Canva costumam precisar).
const PDFJS_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38";

/**
 * true se a página renderizou “em branco” (todos os pixels amostrados claros
 * ou transparentes). O pdf.js pode "desenhar" sem erro nenhum quando o CSP
 * bloqueia compilação de fontes (new Function) ou quando os CMaps falham —
 * resultado: canvas branco sem exception. Detectamos e caímos para o texto
 * extraído, que sempre funciona.
 */
function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const step = 24;
  let samples = 0;
  try {
    for (let y = 2; y < canvas.height; y += step) {
      for (let x = 2; x < canvas.width; x += step) {
        const pixel = context.getImageData(x, y, 1, 1).data;
        samples += 1;
        const alpha = pixel[3];
        const brightness = Math.min(pixel[0], pixel[1], pixel[2]);
        if (alpha > 8 && brightness < 248) return false;
      }
    }
  } catch {
    return false; // canvas tainted etc. — assume que renderizou
  }
  return samples > 8;
}

export function RhResumePreview({
  data,
  mime,
  fileName,
  onClose,
}: {
  data: ArrayBuffer;
  mime: string;
  fileName: string;
  onClose: () => void;
}) {
  const isPdf = mime.includes("pdf");
  const [zoom, setZoom] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(isPdf);
  const [error, setError] = useState<string | null>(null);
  const [textFallback, setTextFallback] = useState<string | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const renderTokenRef = useRef(0);
  const mobile = isMobileShell();

  // Cópia estável do buffer: getDocument "neutra" o ArrayBuffer que recebe
  // (detach), então guardamos uma cópia original para re-renderizar no zoom.
  const originalRef = useRef<ArrayBuffer | null>(null);
  useEffect(() => {
    originalRef.current = isPdf ? data.slice(0) : null;
  }, [data, isPdf]);

  const friendlyError = useCallback((raw: unknown): string => {
    const message = raw instanceof Error ? raw.message : String(raw);
    if (/password/i.test(message))
      return "Este PDF é protegido por senha — envie o arquivo sem senha.";
    if (/InvalidPDF|invalid pdf/i.test(message))
      return "Arquivo PDF inválido ou corrompido. Peça o reenvio pelo portal.";
    if (/fetch|network|Failed/i.test(message))
      return "Falha de rede ao carregar recursos do PDF. Verifique a conexão e tente novamente.";
    return message || "Não foi possível exibir o PDF.";
  }, []);

  useEffect(() => {
    if (!isPdf) return;
    const token = ++renderTokenRef.current;
    let pdf: PdfDocumentProxy | null = null;

    async function render(): Promise<void> {
      const container = pagesRef.current;
      const original = originalRef.current;
      if (!container || !original) return;
      setLoading(true);
      setError(null);
      setTextFallback(null);
      try {
        const pdfjs = await loadPdfJs();
        pdfjs.GlobalWorkerOptions.workerSrc = "pdf.worker.mjs";
        const doc = await pdfjs.getDocument({
          // Cópia por render: o pdf.js consome o buffer passado.
          data: original.slice(0),
          cMapUrl: `${PDFJS_CDN}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
          enableXfa: true,
          // CRÍTICO: o CSP do Electron tem script-src 'self' (sem
          // 'unsafe-eval'); com isEvalSupported=true o pdf.js compila fontes
          // com new Function, o CSP bloqueia e o texto simplesmente não
          // desenha — canvas branco, sem erro. false usa o caminho seguro.
          isEvalSupported: false,
        }).promise;
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
          if (!context)
            throw new Error("Canvas indisponível neste dispositivo.");
          await page.render({ canvasContext: context, viewport }).promise;
          if (renderTokenRef.current !== token) return;
          if (number === 1 && isCanvasBlank(canvas)) {
            // Render “bem-sucedido” mas página vazia (fontes/CMaps): mostra o
            // texto extraído em vez de uma folha branca sem explicação.
            const text = await extractResumeTextFromBuffer(original, mime);
            if (renderTokenRef.current !== token) return;
            container.replaceChildren();
            if (text.trim()) {
              setTextFallback(text);
              setLoading(false);
              return;
            }
            throw new Error(
              "Não foi possível exibir este PDF — baixe o arquivo para abrir.",
            );
          }
          const frame = document.createElement("div");
          frame.style.marginBottom = mobile ? "10px" : "14px";
          frame.appendChild(canvas);
          container.appendChild(frame);
        }
        setLoading(false);
      } catch (renderError) {
        if (renderTokenRef.current !== token) return;
        setLoading(false);
        setError(friendlyError(renderError));
      }
    }

    void render();

    return () => {
      renderTokenRef.current += 1; // invalida o render em curso
      if (pagesRef.current) pagesRef.current.replaceChildren();
      void pdf?.destroy();
    };
  }, [zoom, isPdf, attempt, mobile, friendlyError]);

  // Download local do arquivo já em memória (funciona offline).
  function downloadLocal(): void {
    const blob = new Blob([originalRef.current ?? data], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

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
        {isPdf && !textFallback ? (
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
        <button
          type="button"
          onClick={downloadLocal}
          className="flex items-center gap-1.5 rounded-[8px] border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-[#F0EFEC]/60 transition hover:bg-white/[0.05]"
        >
          <Download className="size-3" /> Baixar
        </button>
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
          <div
            ref={pagesRef}
            className={textFallback ? "hidden" : "mx-auto max-w-[900px]"}
          />
          {textFallback ? (
            <div className="mx-auto max-w-[900px] rounded-[12px] bg-white px-6 py-5 shadow-[0_1px_12px_rgba(0,0,0,0.45)]">
              <p className="mb-3 border-b border-neutral-200 pb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Pré-visualização do conteúdo — {fileName}
              </p>
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-neutral-800">
                {textFallback}
              </pre>
            </div>
          ) : null}
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
            Pré-visualização integrada ainda não disponível para este formato.
            Baixe o arquivo para abrir no seu editor.
          </p>
          <button
            type="button"
            onClick={downloadLocal}
            className="flex items-center gap-1.5 rounded-[8px] bg-[#F0EFEC] px-3 py-1.5 text-[12.5px] font-medium text-[#111111]"
          >
            <Download className="size-3.5" /> Baixar arquivo
          </button>
        </div>
      )}
    </div>
  );
}
