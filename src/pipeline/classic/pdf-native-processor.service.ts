import { Injectable, Logger } from '@nestjs/common'
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

  extractImages(_pdfPath: string, _outputFolder: string): number {
    this.logger.log('PDF image extraction is skipped in NestJS classic path.')
    return 0
  }
}
