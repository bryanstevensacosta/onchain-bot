import { Injectable } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

@Injectable()
export class AppService {
  private nestApp: INestApplication | null = null;

  setNestApp(app: INestApplication): void {
    this.nestApp = app;
  }

  getNestApp(): INestApplication {
    if (!this.nestApp) {
      throw new Error('Nest app not initialized');
    }
    return this.nestApp;
  }

  getHello(): string {
    return 'Hello World!';
  }
}
