import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { APP_CONFIG, appConfig } from './config/app-config'
import { CompletionServiceClient } from './completion/completion-service.client'
import { AppController } from './app.controller'
import { BlockBuilderService } from './pipeline/classic/block-builder.service'
import { ClassicPipelineService } from './pipeline/classic/classic-pipeline.service'
import { DocxProcessorService } from './pipeline/classic/docx-processor.service'
import { DocumentRouterService } from './pipeline/classic/document-router.service'
import { OcrProcessorService } from './pipeline/classic/ocr-processor.service'
import { PdfNativeProcessorService } from './pipeline/classic/pdf-native-processor.service'
import { GatewayLlmPipelineService } from './pipeline/llm/gateway-llm-pipeline.service'

@Module({
  imports: [
    HttpModule.register({
      timeout: Number(process.env.COMPLETION_HTTP_TIMEOUT_MS ?? 120000)
    })
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_CONFIG,
      useValue: appConfig
    },
    CompletionServiceClient,
    ClassicPipelineService,
    GatewayLlmPipelineService,
    DocumentRouterService,
    BlockBuilderService,
    PdfNativeProcessorService,
    DocxProcessorService,
    OcrProcessorService
  ]
})
export class AppModule {}
