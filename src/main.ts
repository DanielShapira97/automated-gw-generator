import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { appConfig } from './config/app-config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true })
  app.useStaticAssets('static', { prefix: '/static' })
  await app.listen(appConfig.port)
  // eslint-disable-next-line no-console
  console.log(`NestJS server running on http://localhost:${appConfig.port}`)
}

bootstrap()
