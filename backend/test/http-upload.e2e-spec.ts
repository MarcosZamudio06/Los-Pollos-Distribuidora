import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FileInterceptor,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'node:http';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { configureHttpApplication } from '../src/bootstrap/configure-http-application';

// Test-only routes exercise the installed Nest/Express/parser/multipart stack.
@Controller('ci-http')
class UploadProbeController {
  @Get()
  health() {
    return { ready: true };
  }

  @Get('unknown-upload-error')
  unknownUploadError(): never {
    throw Object.assign(new Error('private upstream detail'), {
      name: 'MulterError',
      code: 'constructor',
    });
  }

  @Post('json')
  json(@Body() body: Record<string, unknown>) {
    return body;
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 16_384 },
      fileFilter: (_req, file, callback) =>
        callback(
          file.mimetype === 'image/png'
            ? null
            : new BadRequestException('PNG required'),
          file.mimetype === 'image/png',
        ),
    }),
  )
  upload(@UploadedFile() file?: { buffer: Buffer }) {
    return { size: file?.buffer.length ?? 0 };
  }
}

describe('Patched HTTP upload and body-parser transport (e2e)', () => {
  let app: NestExpressApplication;
  let baseURL: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UploadProbeController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttpApplication(
      app,
      new ConfigService({ NODE_ENV: 'test', SWAGGER_ENABLED: false }),
    );
    await app.listen(0, '127.0.0.1');
    baseURL = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('accepts multipart buffers and controls rejected types, fields and size limits', async () => {
    await request(baseURL)
      .post('/api/ci-http/upload')
      .attach('file', Buffer.from('bounded transport fixture'), {
        filename: 'fixture.png',
        contentType: 'image/png',
      })
      .expect(201, { size: 25 });
    const type = await request(baseURL)
      .post('/api/ci-http/upload')
      .attach('file', Buffer.from('not png'), {
        filename: 'fixture.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    expect(type.body).toMatchObject({
      success: false,
      error: 'BAD_REQUEST',
      message: 'PNG required',
    });
    await request(baseURL)
      .post('/api/ci-http/upload')
      .attach('unknown', Buffer.from('bounded'), 'fixture.png')
      .expect(400);
    const large = await request(baseURL)
      .post('/api/ci-http/upload')
      .attach('file', Buffer.alloc(16_385), {
        filename: 'fixture.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(large.body).toMatchObject({
      success: false,
      statusCode: 413,
      error: 'PAYLOAD_TOO_LARGE',
    });
    await request(baseURL).get('/api/ci-http').expect(200, { ready: true });
  });

  it('parses compressed JSON and controls malformed JSON/compression without terminating Nest', async () => {
    const response = await fetch(`${baseURL}/api/ci-http/json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
      body: gzipSync(Buffer.from('{"value":7}')),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ value: 7 });
    await request(baseURL)
      .post('/api/ci-http/json')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    const malformed = await fetch(`${baseURL}/api/ci-http/json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
      body: Buffer.from('invalid gzip'),
    });
    expect(malformed.status).toBe(400);
    await request(baseURL).get('/api/ci-http').expect(200);
  });

  it('does not expose or downgrade unknown upstream errors', async () => {
    const response = await request(baseURL)
      .get('/api/ci-http/unknown-upload-error')
      .expect(500);
    expect(response.body).toMatchObject({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'private upstream detail',
    );
  });

  it('survives one bounded interrupted multipart upload and accepts the next request', async () => {
    await new Promise<void>((resolve) => {
      const req = httpRequest(`${baseURL}/api/ci-http/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=ci-boundary',
          'Content-Length': '1024',
        },
      });
      req.on('error', () => resolve());
      req.on('socket', (socket) =>
        socket.once('connect', () => {
          req.write(
            '--ci-boundary\r\nContent-Disposition: form-data; name="file"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\npartial',
            () => req.destroy(),
          );
        }),
      );
      req.on('close', () => resolve());
      req.flushHeaders();
    });
    await request(baseURL).get('/api/ci-http').expect(200, { ready: true });
  });
});
