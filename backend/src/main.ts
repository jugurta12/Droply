import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors(); // ◄── AJOUTE CETTE LIGNE INDISPENSABLE !

  await app.listen(3000);
  console.log('Le backend Droply tourne sur : http://localhost:3000');
}
bootstrap();