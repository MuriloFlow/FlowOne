// Carregador do pdfjs-dist configurado para o FLOW (desktop + mobile).
//
// O Electron empacotado roda o renderer em file:// e o WebView Android tem
// restrições próprias: new Worker(new URL(...)) falha nos dois (URL de worker
// fora de http(s)/blob não é suportada), o que deixava o visualizador de
// currículo com tela branca e quebrava a extração de texto para a IA.
//
// Solução: rodar o message handler do worker na PRÓPRIA thread principal via
// globalThis.pdfjsWorker — hook oficial do pdf.js (PDFWorker.#mainThreadWorker
//MessageHandler / _setupFakeWorkerGlobal) — que funciona igual no Electron
// empacotado, no Vite dev e no WebView mobile. O Vite resolve o import
// dinâmico como chunk próprio (sem new URL, para não virar asset solto).

export type PdfJs = typeof import("pdfjs-dist");
export type PdfDocumentProxy = Awaited<
  ReturnType<PdfJs["getDocument"]>["promise"]
>;

let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjs, workerModule] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs"),
      ]);
      (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker =
        workerModule;
      // Nunca usado no caminho main-thread, mas evita o throw do getter caso
      // alguma rotina interna consulte workerSrc antes do hook.
      pdfjs.GlobalWorkerOptions.workerSrc = "pdf.worker.mjs";
      return pdfjs;
    })();
    // Falhou (chunk corrompido etc.): permite retry na próxima chamada.
    void pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}
