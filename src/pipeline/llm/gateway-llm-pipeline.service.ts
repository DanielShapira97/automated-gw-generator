import { Inject, Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { APP_CONFIG, AppConfig } from '../../config/app-config'
import { CompletionServiceClient } from '../../completion/completion-service.client'
import { DocxProcessorService } from '../classic/docx-processor.service'
import { PdfNativeProcessorService } from '../classic/pdf-native-processor.service'

const BLOCK_PROMPT = `You receive RAW TEXT from PDF/DOCX extraction (not human-authored layout). Your job is (A) repair common EXTRACTION ARTIFACTS only, then (B) segment the result into GROUND-TRUTH BLOCKS for downstream n-gram evaluation.

(A) Allowed mechanical fixes — apply ONLY when the pattern is clearly extraction noise, not intentional document content:
• Letter-spaced words: merge single letters separated by single spaces into one word when they obviously form one word (e.g. "h e l l o" → "hello"). Do not merge across punctuation, numbers, or clearly separate tokens.
• Broken words at line breaks: join a trailing hyphen at end of line to the following fragment on the next line when it is clearly one word split across a line (e.g. line ends with "exam-" and next line starts with "ple" → use "example").
• Stray soft breaks in prose: if a line ends mid-word without hyphen and the next line continues the same word (rare extraction glitch), join without adding or guessing letters.
• Whitespace in prose: collapse runs of 2+ spaces to one space; normalize only obvious stray blank lines (max one consecutive newline where extraction duplicated line breaks). Inside table rows (lines using |), preserve spacing needed for columns.
• Remove invisible/control characters that add no meaning (e.g. zero-width space, BOM) except inside tables if removal would break alignment.

(B) Forbidden edits — do NOT paraphrase, translate, complete missing words, fix spelling/grammar, change numbers or names, add headings, summarize, omit content, or "improve" wording beyond the mechanical fixes above.

(C) Blocking rules:
• Each block is a SEMANTIC UNIT (e.g. cover-like front matter, chapter body, author bio). Do not split mid-sentence or mid-phrase unless there is a clear topical/section boundary.
• Preserve ORIGINAL READING ORDER. Do not reorder blocks.
• NO MARKDOWN except tables: use | and --- row separators for tables only.
• Every block MUST start with a line "====" and end with a line "====". No nested ====.
• Prefer boundaries at: title/cover-like front matter, major section headings, table boundaries, author/about sections, appendices.
• Return ONLY the blocks (no preamble, no commentary).

Text:

`

@Injectable()
export class GatewayLlmPipelineService {
  constructor(
    private readonly completionClient: CompletionServiceClient,
    private readonly docxProcessor: DocxProcessorService,
    private readonly pdfProcessor: PdfNativeProcessorService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async processDocument(
    filePath: string,
    opts?: { skipImageExtract?: boolean }
  ): Promise<string> {
    const docName = path.parse(path.basename(filePath)).name
    const docOutputDir = path.join(this.config.outputBaseDir, docName)
    fs.mkdirSync(docOutputDir, { recursive: true })

    const ext = path.extname(filePath).toLowerCase()
    const rawText = await this.getRawText(filePath, ext, docOutputDir, opts?.skipImageExtract === true)
    const finalGt = await this.structureIntoBlocks(rawText)

    const outPath = path.join(docOutputDir, `${docName} ground truth.txt`)
    fs.writeFileSync(outPath, finalGt, 'utf-8')
    return outPath
  }

  private async getRawText(
    filePath: string,
    ext: string,
    outputDir: string,
    skipImageExtract: boolean
  ): Promise<string> {
    if (ext === '.docx') {
      if (!skipImageExtract) {
        this.docxProcessor.extractImages(filePath, outputDir)
      }
      const elements = await this.docxProcessor.extractTextWithMetadata(filePath)
      return elements.map((e) => e.text).join('\n')
    }

    if (ext === '.pdf') {
      if (!skipImageExtract) {
        this.pdfProcessor.extractImages(filePath, outputDir)
      }
      const spans = await this.pdfProcessor.extractTextWithMetadata(filePath)
      return spans.map((s) => s.text).join('\n')
    }

    throw new Error(`Unsupported input format: ${ext}`)
  }

  private async structureIntoBlocks(rawText: string): Promise<string> {
    if (!rawText.trim()) {
      return 'Error: No text extracted.'
    }
    const prompt = `${BLOCK_PROMPT}${rawText}`
    return this.completionClient.generateAnswer(prompt, this.config.completionModel, { allowFallback: false })
  }
}
