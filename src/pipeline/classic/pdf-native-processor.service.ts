import { Injectable, Logger } from '@nestjs/common'
import { spawnSync } from 'child_process'
import { ExtractedElement } from '../../types/extracted-element'

@Injectable()
export class PdfNativeProcessorService {
  private readonly logger = new Logger(PdfNativeProcessorService.name)

  async extractTextWithMetadata(pdfPath: string): Promise<ExtractedElement[]> {
    this.logger.log(`Starting native PDF extraction for: ${pdfPath}`)
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjs.getDocument(pdfPath)
    const pdf = await loadingTask.promise
    const output: ExtractedElement[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      for (const item of content.items as Array<any>) {
        const str = `${item.str ?? ''}`.trim()
        if (!str) {
          continue
        }
        const a = Number(item.transform?.[0] ?? 12)
        const b = Number(item.transform?.[1] ?? 0)
        const y = Number(item.transform?.[5] ?? 0)
        const size = Math.round(Math.hypot(a, b) * 10) / 10
        output.push({
          text: str,
          fontSize: size || 12,
          fontName: item.fontName,
          yPos: y,
          isBold: `${item.fontName ?? ''}`.toLowerCase().includes('bold')
        })
      }
    }

    this.logger.log(`Extracted ${output.length} PDF text spans.`)
    return output
  }

  extractImages(pdfPath: string, outputFolder: string): number {
    // Reuse the existing Python/PyMuPDF extraction path already used in this repo's
    // original implementation, so PDF embedded images are saved for download.
    const py = `
import hashlib, json, os, sys
try:
    import fitz
except Exception:
    print(json.dumps({"ok": False, "count": 0, "error": "PyMuPDF not installed"}))
    sys.exit(0)

pdf_path = sys.argv[1]
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
seen = set()
written = 0
try:
    doc = fitz.open(pdf_path)
    for page_index in range(len(doc)):
        for img in doc.get_page_images(page_index):
            xref = img[0]
            base = doc.extract_image(xref)
            ext = base.get("ext", "bin")
            data = base.get("image", b"")
            h = hashlib.sha256(data).hexdigest()
            if h in seen:
                continue
            seen.add(h)
            out_path = os.path.join(out_dir, f"img_{h[:16]}.{ext}")
            with open(out_path, "wb") as f:
                f.write(data)
            written += 1
    doc.close()
    print(json.dumps({"ok": True, "count": written}))
except Exception as e:
    print(json.dumps({"ok": False, "count": written, "error": str(e)}))
`

    const run = spawnSync('python', ['-c', py, pdfPath, outputFolder], {
      encoding: 'utf-8'
    })

    if (run.error) {
      this.logger.warn(`PDF image extraction failed to start Python: ${run.error.message}`)
      return 0
    }

    const output = (run.stdout ?? '').trim().split(/\r?\n/).filter(Boolean).pop()
    if (!output) {
      this.logger.warn('PDF image extraction returned no output.')
      return 0
    }

    try {
      const parsed = JSON.parse(output) as { ok: boolean; count: number; error?: string }
      if (!parsed.ok) {
        this.logger.warn(`PDF image extraction warning: ${parsed.error ?? 'unknown error'}`)
      } else {
        this.logger.log(`Extracted ${parsed.count} images from PDF.`)
      }
      return Number(parsed.count ?? 0)
    } catch {
      this.logger.warn(`PDF image extraction returned non-JSON output: ${output}`)
      return 0
    }
  }
}
