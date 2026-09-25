import { BadRequestException, Controller, Get, NotFoundException, Param, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { basename, resolve } from 'node:path';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { memoryStorage } from 'multer';
import sharp from 'sharp';
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
    storage: memoryStorage(),
    fileFilter: (_request: any, file: any, done: (error: Error | null, accepted: boolean) => void) => done(imageTypes.has(file.mimetype) ? null : new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), imageTypes.has(file.mimetype)),
  }))
  async upload(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException('Image file is required');
    const fileName = `${randomUUID()}.webp`;
    try {
      mkdirSync(directory(), { recursive: true });
      const optimized = await sharp(file.buffer, { animated: false }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84, effort: 4 }).toBuffer();
      await writeFile(resolve(directory(), fileName), optimized);
    } catch {
      throw new BadRequestException('The image could not be processed');
    }
    const baseUrl = this.config.get<string>('UPLOAD_PUBLIC_BASE_URL') ?? `http://localhost:${this.config.get<string>('PORT') ?? '3010'}/api/uploads`;
    return { url: `${baseUrl}/${fileName}`, fileName };
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
