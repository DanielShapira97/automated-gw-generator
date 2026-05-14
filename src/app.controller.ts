import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import * as fs from 'fs'
import * as path from 'path'
import { Response } from 'express'
import mammoth from 'mammoth'
import { ClassicPipelineService } from './pipeline/classic/classic-pipeline.service'
import { GatewayLlmPipelineService } from './pipeline/llm/gateway-llm-pipeline.service'
import { APP_CONFIG, AppConfig } from './config/app-config'
import { Inject } from '@nestjs/common'
import { createHash } from 'crypto'

@Controller()
export class AppController {
  constructor(
    private readonly classicPipeline: ClassicPipelineService,
    private readonly llmPipeline: GatewayLlmPipelineService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {
    fs.mkdirSync(this.config.uploadsDir, { recursive: true })
  }

  @Get('/')
  getRoot(): string {
    return fs.readFileSync(path.join(process.cwd(), 'static', 'index.html'), 'utf-8')
  }

  private static readonly PREVIEW_DOCX_MAX_CHARS = 250_000

  @Post('/api/preview-docx')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async previewDocx(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Missing file')
    }
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext !== '.docx') {
      throw new BadRequestException('Only .docx is supported for HTML preview')
    }
    const htmlResult = await mammoth.convertToHtml({ buffer: file.buffer })
    let html = htmlResult.value ?? ''
    let truncated = false
    if (html.length > AppController.PREVIEW_DOCX_MAX_CHARS) {
      html = html.slice(0, AppController.PREVIEW_DOCX_MAX_CHARS)
      truncated = true
    }
    return { html, truncated }
  }

  @Post('/api/save-gw')
  async saveGw(@Body() body: { path?: string; content?: string }) {
    const filePath = body.path
    const content = body.content
    if (!filePath || typeof content !== 'string') {
      throw new BadRequestException('Missing path or content')
    }
    const resolved = path.resolve(filePath)
    if (!this.isAllowedFilePath(resolved)) {
      throw new BadRequestException('Invalid path')
    }
    if (!resolved.toLowerCase().endsWith('.txt')) {
      throw new BadRequestException('Only .txt ground truth files can be saved')
    }
    fs.writeFileSync(resolved, content, 'utf-8')
    return { success: true, path: resolved }
  }

  @Post('/api/process')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async processFile(@UploadedFile() file: Express.Multer.File, @Body('mode') mode: string) {
    if (!file) {
      throw new BadRequestException('Missing file')
    }
    const cleanName = path.basename(file.originalname)
    const uploadPath = path.join(this.config.uploadsDir, cleanName)
    fs.writeFileSync(uploadPath, file.buffer)

    const runClassic = async () => {
      const resultPath = await this.classicPipeline.processDocument(uploadPath)
      return {
        resultPath,
        content: fs.readFileSync(resultPath, 'utf-8'),
        imagePaths: this.listImages(path.dirname(resultPath))
      }
    }

    const runLlm = async (skipImageExtract?: boolean) => {
      const resultPath = await this.llmPipeline.processDocument(uploadPath, {
        skipImageExtract: skipImageExtract === true
      })
      return {
        resultPath,
        content: fs.readFileSync(resultPath, 'utf-8'),
        imagePaths: this.listImages(path.dirname(resultPath))
      }
    }

    if (mode === 'compare') {
      const classic = await runClassic()
      const llm = await runLlm(true)
      const imagePathsMerged = this.mergeUniqueImagePaths(classic.imagePaths, llm.imagePaths)
      return {
        success: true,
        mode: 'compare',
        classic_content: classic.content,
        llm_content: llm.content,
        classic_path: classic.resultPath,
        llm_path: llm.resultPath,
        image_paths: imagePathsMerged,
        classic_image_paths: classic.imagePaths,
        llm_image_paths: llm.imagePaths
      }
    }

    if (mode === 'llm') {
      const llm = await runLlm()
      return {
        success: true,
        mode: 'llm',
        content: llm.content,
        filename: path.basename(llm.resultPath),
        result_path: llm.resultPath,
        image_paths: llm.imagePaths
      }
    }

    const classic = await runClassic()
    return {
      success: true,
      mode: 'classic',
      content: classic.content,
      filename: path.basename(classic.resultPath),
      result_path: classic.resultPath,
      image_paths: classic.imagePaths
    }
  }

  @Get('/api/download')
  downloadFile(@Query('path') filePath: string, @Res() res: Response) {
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }
    return res.download(filePath, path.basename(filePath))
  }

  /** Inline image response for <img src> previews (download endpoint uses attachment). */
  @Get('/api/preview')
  previewFile(@Query('path') filePath: string, @Res() res: Response) {
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }
    const resolved = path.resolve(filePath)
    if (!this.isAllowedFilePath(resolved)) {
      return res.status(403).json({ error: 'Invalid path' })
    }
    const ext = path.extname(resolved).toLowerCase()
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.gif'
            ? 'image/gif'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.bmp'
                ? 'image/bmp'
                : ext === '.tif' || ext === '.tiff'
                  ? 'image/tiff'
                  : 'application/octet-stream'
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolved)}"`)
    return res.sendFile(resolved)
  }

  private isAllowedFilePath(resolvedPath: string): boolean {
    const outDir = path.resolve(this.config.outputBaseDir)
    const upDir = path.resolve(this.config.uploadsDir)
    const under = (base: string) => {
      const rel = path.relative(base, resolvedPath)
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    }
    return under(outDir) || under(upDir)
  }

  private listImages(folderPath: string): string[] {
    if (!fs.existsSync(folderPath)) {
      return []
    }

    const imageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff'])
    const paths = fs
      .readdirSync(folderPath)
      .filter((fileName) => imageExt.has(path.extname(fileName).toLowerCase()))
      .map((fileName) => path.join(folderPath, fileName))
    const pathDeduped = this.mergeUniqueImagePaths(paths, [])
    return this.dedupeImagePathsByFileContent(pathDeduped)
  }

  /** One entry per identical file bytes (e.g. legacy copy + hash-named file). */
  private dedupeImagePathsByFileContent(paths: string[]): string[] {
    const byHash = new Map<string, string>()
    for (const p of paths) {
      try {
        const resolved = path.resolve(p)
        const buf = fs.readFileSync(resolved)
        const h = createHash('sha256').update(buf).digest('hex')
        if (!byHash.has(h)) {
          byHash.set(h, p)
        }
      } catch {
        const fallback = `!path:${p}`
        if (!byHash.has(fallback)) {
          byHash.set(fallback, p)
        }
      }
    }
    return [...byHash.values()]
  }

  /** Dedupe by resolved path (same file, different spellings) while preserving first occurrence string. */
  private mergeUniqueImagePaths(a: string[], b: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const p of [...a, ...b]) {
      if (!p) continue
      const key = path.resolve(p)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(p)
    }
    return out
  }
}
