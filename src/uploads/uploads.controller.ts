import { BadRequestException, Controller, Get, NotFoundException, Param, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { basename, resolve } from 'node:path';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

const directory = () => resolve(process.env.UPLOAD_DIR ?? 'uploads');
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Controller('admin/uploads')
@UseGuards(JwtAuthGuard)
export class AdminUploadsController {
  constructor(private readonly config: ConfigService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 },
    storage: diskStorage({
      destination: (_request: any, _file: any, done: (error: Error | null, destination: string) => void) => { const target = directory(); mkdirSync(target, { recursive: true }); done(null, target); },
      filename: (_request: any, file: any, done: (error: Error | null, filename: string) => void) => done(null, `${randomUUID()}.${file.mimetype.split('/')[1]}`),
    }),
    fileFilter: (_request: any, file: any, done: (error: Error | null, accepted: boolean) => void) => done(imageTypes.has(file.mimetype) ? null : new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), imageTypes.has(file.mimetype)),
  }))
  upload(@UploadedFile() file: { filename: string } | undefined) {
    if (!file) throw new BadRequestException('Image file is required');
    const baseUrl = this.config.get<string>('UPLOAD_PUBLIC_BASE_URL') ?? `http://localhost:${this.config.get<string>('PORT') ?? '3010'}/api/uploads`;
    return { url: `${baseUrl}/${file.filename}`, fileName: file.filename };
  }
}

@Controller('uploads')
export class PublicUploadsController {
  @Get(':fileName') file(@Param('fileName') fileName: string) {
    const path = resolve(directory(), basename(fileName));
    if (!existsSync(path)) throw new NotFoundException('Image not found');
    return new StreamableFile(createReadStream(path));
  }
}
