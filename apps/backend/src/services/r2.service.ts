import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

let s3Client: S3Client | null = null;

if (
  env.CLOUDFLARE_R2_ACCESS_KEY &&
  env.CLOUDFLARE_R2_SECRET_KEY &&
  env.CLOUDFLARE_R2_ENDPOINT &&
  env.CLOUDFLARE_R2_ACCESS_KEY !== 'r2-access-key'
) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY,
      secretAccessKey: env.CLOUDFLARE_R2_SECRET_KEY,
    },
  });
}

export class R2Service {
  /**
   * Uploads a file buffer to Cloudflare R2. Falls back to local storage if R2 is not configured.
   */
  static async uploadFile(buffer: Buffer, key: string, mimeType: string, publicBaseUrl?: string): Promise<string> {
    if (s3Client && env.CLOUDFLARE_R2_BUCKET) {
      try {
        const command = new PutObjectCommand({
          Bucket: env.CLOUDFLARE_R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        });
        await s3Client.send(command);
        // Constructed R2 public or private endpoint URL
        const domain = env.CLOUDFLARE_R2_ENDPOINT!.replace('https://', '').split('/')[0];
        return `https://${env.CLOUDFLARE_R2_BUCKET}.${domain}/${key}`;
      } catch (error: any) {
        logger.error('Failed to upload file to Cloudflare R2. Falling back to local.', { metadata: { error: error.message } });
      }
    }

    // Local Storage Fallback
    try {
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      await fs.promises.mkdir(uploadsDir, { recursive: true });
      
      const fileName = `${Date.now()}-${key.replace(/\//g, '_')}`;
      const filePath = path.join(uploadsDir, fileName);
      await fs.promises.writeFile(filePath, buffer);
      
      const baseUrl = (publicBaseUrl || env.PUBLIC_API_URL || `http://localhost:${env.PORT}`).replace(/\/$/, '');
      return `${baseUrl}/uploads/${encodeURIComponent(fileName)}`;
    } catch (error: any) {
      logger.error('Local file upload fallback failed', { metadata: { error: error.message } });
      throw error;
    }
  }

  /**
   * Deletes a file from Cloudflare R2 or local storage.
   */
  static async deleteFile(fileUrl: string): Promise<void> {
    if (fileUrl.includes('/uploads/')) {
      // Local delete
      try {
        const fileName = fileUrl.split('/uploads/')[1];
        const filePath = path.join(process.cwd(), 'uploads', fileName);
        await fs.promises.unlink(filePath).catch(() => {});
      } catch (error: any) {
        logger.error('Failed to delete local file', { metadata: { error: error.message } });
      }
      return;
    }

    if (s3Client && env.CLOUDFLARE_R2_BUCKET) {
      try {
        // Extract key from URL
        const urlObj = new URL(fileUrl);
        const key = urlObj.pathname.substring(1); // remove leading slash
        const command = new DeleteObjectCommand({
          Bucket: env.CLOUDFLARE_R2_BUCKET,
          Key: key,
        });
        await s3Client.send(command);
      } catch (error: any) {
        logger.error('Failed to delete file from Cloudflare R2', { metadata: { error: error.message } });
      }
    }
  }
}

export default R2Service;
