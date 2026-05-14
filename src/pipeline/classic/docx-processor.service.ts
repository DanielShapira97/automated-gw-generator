import { Injectable, Logger } from '@nestjs/common'
import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import mammoth from 'mammoth'
import { ExtractedElement } from '../../types/extracted-element'

@Injectable()
export class DocxProcessorService {
  private readonly logger = new Logger(DocxProcessorService.name)

  async extractTextWithMetadata(docxPath: string): Promise<ExtractedElement[]> {
    this.logger.log(`Starting DOCX extraction for: ${docxPath}`)
    const htmlResult = await mammoth.convertToHtml({ path: docxPath })
    const html = htmlResult.value ?? ''
    const blocks = html.match(/<table[\s\S]*?<\/table>|<p[\s\S]*?<\/p>|<h[1-6][\s\S]*?<\/h[1-6]>/gi) ?? []
    const elements: ExtractedElement[] = []
    let paraIndex = 0

    for (const block of blocks) {
      if (block.toLowerCase().startsWith('<table')) {
        const drawnTable = this.drawTableFromHtml(block)
        if (drawnTable) {
          elements.push({
            text: drawnTable,
            fontSize: 12,
            isBold: false,
            style: 'Table',
            paraIndex
          })
          paraIndex += 1
        }
        continue
      }

      const text = this.sanitizeText(this.extractTextFromHtml(block))
      if (!text) {
        continue
      }
      elements.push({
        text,
        fontSize: 12,
        isBold: false,
        style: 'Normal',
        paraIndex
      })
      paraIndex += 1
    }

    this.logger.log(`Extracted ${elements.length} DOCX blocks (paragraphs + tables).`)
    return elements
  }

  extractImages(docxPath: string, outputFolder: string): number {
    this.logger.log('Extracting DOCX images...')
    const zip = new AdmZip(docxPath)
    const entries = zip.getEntries().filter((entry) => entry.entryName.startsWith('word/media/'))
    const seenHashes = new Set<string>()
    let written = 0

    for (const entry of entries) {
      const buf = entry.getData()
      const hash = createHash('sha256').update(buf).digest('hex')
      if (seenHashes.has(hash)) {
        continue
      }
      seenHashes.add(hash)
      const ext = path.extname(entry.entryName) || '.bin'
      const out = path.join(outputFolder, `img_${hash.slice(0, 16)}${ext}`)
      fs.writeFileSync(out, buf)
      written += 1
    }

    this.logger.log(`Extracted ${written} unique images from DOCX (${entries.length} media entries).`)
    return written
  }

  private drawTableFromHtml(tableHtml: string): string {
    const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
    const parsedRows = rows
      .map((rowXml) => {
        const cells = rowXml.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []
        return cells.map((cellXml) => this.sanitizeText(this.extractTextFromHtml(cellXml)).replace(/\|/g, '\\|').trim())
      })
      .filter((row) => row.some((cell) => cell.length > 0))

    if (!parsedRows.length) {
      return ''
    }

    const colCount = Math.max(...parsedRows.map((row) => row.length))
    const normalizedRows = parsedRows.map((row) => {
      const padded = [...row]
      while (padded.length < colCount) {
        padded.push('')
      }
      return padded
    })

    const header = `| ${normalizedRows[0].join(' | ')} |`
    const separator = `| ${Array(colCount).fill('---').join(' | ')} |`
    const body = normalizedRows.slice(1).map((row) => `| ${row.join(' | ')} |`)

    return [header, separator, ...body].join('\n')
  }

  private extractTextFromHtml(html: string): string {
    const withNewlines = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
    const withoutTags = withNewlines.replace(/<[^>]+>/g, ' ')
    return this.decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim()
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
  }

  private sanitizeText(value: string): string {
    return value
      .replace(/<\/?w:[^>]*>/gi, ' ')
      .replace(/<\?xml[^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
}
