import { requestUrl } from 'obsidian';
import { CraftAPI } from '../api/craftAPI';
import { FileUpload } from '../api/types';
import { getMimeType, arrayBufferToBase64, extractFilenameFromUrl } from './textUtils';

export class ImageManager {
	constructor(private api: CraftAPI) {}

	async uploadFromFile(file: File): Promise<{ id: string, url: string }> {
		console.log('📁 Processing local file:', file.name, file.size, 'bytes');
		
		const imageData = await file.arrayBuffer();
		const fileUpload: FileUpload = {
			fileData: this.createDataURL(imageData, file.name),
			filename: file.name
		};

		return await this.api.uploadImage(fileUpload, file.name);
	}

	async uploadFromUrl(imageUrl: string, customFilename?: string): Promise<{ id: string, url: string }> {
		console.log('🌐 Downloading from URL:', imageUrl);
		
		try {
			const response = await requestUrl({
				url: imageUrl,
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; ObsidianBot/1.0)'
				}
			});

			if (response.status !== 200) {
				throw new Error(`Failed to download image: HTTP ${response.status}`);
			}

			// Validate content type
			const contentType = response.headers['content-type'] || response.headers['Content-Type'];
			if (contentType && !contentType.startsWith('image/')) {
				throw new Error(`URL returned ${contentType}, expected image content`);
			}

			const imageData = response.arrayBuffer;
			if (imageData.byteLength === 0) {
				throw new Error('Downloaded image has no content');
			}

			// Generate filename
			const filename = customFilename || extractFilenameFromUrl(imageUrl);
			
			const fileUpload: FileUpload = {
				fileData: this.createDataURL(imageData, filename),
				filename: filename
			};

			console.log('✅ Downloaded image data:', imageData.byteLength, 'bytes');
			return await this.api.uploadImage(fileUpload, filename);

		} catch (error) {
			console.error('💥 URL download failed:', error);
			throw new Error(`Failed to download image from URL: ${error.message}`);
		}
	}

	async uploadImageData(imageData: ArrayBuffer, filename: string): Promise<{ id: string, url: string }> {
		const fileUpload: FileUpload = {
			fileData: this.createDataURL(imageData, filename),
			filename: filename
		};

		return await this.api.uploadImage(fileUpload, filename);
	}

	private createDataURL(imageData: ArrayBuffer, filename: string): string {
		const base64Data = arrayBufferToBase64(imageData);
		const mimeType = getMimeType(filename);
		return `data:${mimeType};base64,${base64Data}`;
	}

	generateAssetCode(assetId: string): string {
		return `{asset:${assetId}:img}`;
	}

	// Utility methods for file validation
	isValidImageFile(file: File): boolean {
		return file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024; // 10MB limit
	}

	getImagePreview(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => resolve(e.target?.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}
}