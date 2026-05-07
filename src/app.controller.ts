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
import { ClassicPipelineService } from './pipeline/classic/classic-pipeline.service'
import { GatewayLlmPipelineService } from './pipeline/llm/gateway-llm-pipeline.service'
import { APP_CONFIG, AppConfig } from './config/app-config'
import { Inject } from '@nestjs/common'

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

    const runLlm = async () => {
      const resultPath = await this.llmPipeline.processDocument(uploadPath)
      return {
        resultPath,
        content: fs.readFileSync(resultPath, 'utf-8'),
        imagePaths: this.listImages(path.dirname(resultPath))
      }
    }

    if (mode === 'compare') {
      const classic = await runClassic()
      const llm = await runLlm()
      return {
        success: true,
        mode: 'compare',
        classic_content: classic.content,
        llm_content: llm.content,
        classic_path: classic.resultPath,
        llm_path: llm.resultPath,
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

  private listImages(folderPath: string): string[] {
    if (!fs.existsSync(folderPath)) {
      return []
    }

    const imageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff'])
    return fs
      .readdirSync(folderPath)
      .filter((fileName) => imageExt.has(path.extname(fileName).toLowerCase()))
      .map((fileName) => path.join(folderPath, fileName))
  }
}
