import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./modules/app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env["PORT"] ? Number(process.env["PORT"]) : 4000;
  const host = process.env["HOST"]?.trim() || "127.0.0.1";
  await app.listen(port, host);
}

bootstrap();
