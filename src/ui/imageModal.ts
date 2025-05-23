import { App, Editor, Modal, Notice } from 'obsidian';
import CraftCMSPlugin from '../main';
import { ImageManager } from '../content/imageManager';
import { sanitizeFilename, extractFilenameFromUrl } from '../utils/textUtils';

export class ImageUploadModal extends Modal {
	private plugin: CraftCMSPlugin;
	private editor: Editor;
	private imageManager: ImageManager;
	private selectedFile: File | null = null;
	private imageUrl: string = '';
	private filename: string = '';
	private previewContainer: HTMLElement;

	constructor(app: App, plugin: CraftCMSPlugin, editor: Editor) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
		this.imageManager = new ImageManager(plugin.api);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		// Add custom CSS styles
		this.addCustomStyles();

		// Header with icon
		const header = contentEl.createDiv('craft-upload-header');
		header.innerHTML = `
			<div class="craft-header-content">
				<svg class="craft-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
					<circle cx="8.5" cy="8.5" r="1.5"/>
					<polyline points="21,15 16,10 5,21"/>
				</svg>
				<h2>Upload Image to Craft CMS</h2>
			</div>
		`;

		const form = contentEl.createDiv('craft-upload-form');

		// File upload section with drag & drop styling
		const fileSection = form.createDiv('craft-upload-section');
		const fileHeader = fileSection.createDiv('craft-section-header');
		fileHeader.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
				<polyline points="7,10 12,15 17,10"/>
				<line x1="12" y1="15" x2="12" y2="3"/>
			</svg>
			<span>Select Image</span>
		`;

		// Drag & drop area
		const dropZone = fileSection.createDiv('craft-drop-zone');
		dropZone.innerHTML = `
			<div class="craft-drop-content">
				<svg class="craft-drop-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
					<circle cx="8.5" cy="8.5" r="1.5"/>
					<polyline points="21,15 16,10 5,21"/>
				</svg>
				<div class="craft-drop-text">
					<p class="primary">Drop image here or click to browse</p>
					<p class="secondary">PNG, JPG, GIF, WebP up to 10MB</p>
				</div>
			</div>
		`;
		
		const fileInput = dropZone.createEl('input', { 
			type: 'file', 
			attr: { accept: 'image/*' },
			cls: 'craft-file-input'
		});

		// URL input section
		const urlSection = form.createDiv('craft-upload-section');
		const urlHeader = urlSection.createDiv('craft-section-header');
		urlHeader.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
				<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
			</svg>
			<span>Or use URL</span>
		`;
		
		const urlInput = urlSection.createEl('input', { 
			type: 'url', 
			placeholder: 'https://example.com/image.jpg',
			cls: 'craft-url-input'
		});

		// Filename section
		const nameSection = form.createDiv('craft-upload-section');
		const nameHeader = nameSection.createDiv('craft-section-header');
		nameHeader.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
				<polyline points="14,2 14,8 20,8"/>
				<line x1="16" y1="13" x2="8" y2="13"/>
				<line x1="16" y1="17" x2="8" y2="17"/>
				<polyline points="10,9 9,9 8,9"/>
			</svg>
			<span>File Name</span>
		`;
		
		const filenameInput = nameSection.createEl('input', { 
			type: 'text', 
			placeholder: 'my-awesome-image.jpg',
			value: this.filename,
			cls: 'craft-filename-input'
		});

		// Preview section
		const previewSection = form.createDiv('craft-upload-section');
		const previewHeader = previewSection.createDiv('craft-section-header');
		previewHeader.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
				<circle cx="12" cy="12" r="3"/>
			</svg>
			<span>Preview</span>
		`;
		
		this.previewContainer = previewSection.createDiv('craft-preview-container');
		this.previewContainer.createDiv('craft-preview-placeholder').innerHTML = `
			<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
				<circle cx="8.5" cy="8.5" r="1.5"/>
				<polyline points="21,15 16,10 5,21"/>
			</svg>
			<p>No image selected</p>
		`;

		// Button section
		const buttonContainer = form.createDiv('craft-button-container');
		
		const uploadBtn = buttonContainer.createEl('button', { 
			text: '🚀 Upload & Get Asset Code', 
			cls: 'craft-upload-btn'
		});
		
		const cancelBtn = buttonContainer.createEl('button', { 
			text: 'Cancel',
			cls: 'craft-cancel-btn'
		});

		// Event listeners with enhanced UX
		this.setupEventListeners(fileInput, urlInput, filenameInput, dropZone, uploadBtn, cancelBtn);
		
		this.updatePreview();
	}

	private addCustomStyles() {
		if (!document.querySelector('#craft-image-modal-css')) {
			const style = document.createElement('style');
			style.id = 'craft-image-modal-css';
			style.textContent = `
				/* Header */
				.craft-upload-header {
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					margin: -20px -20px 20px -20px;
					padding: 20px;
					border-radius: 8px 8px 0 0;
				}
				
				.craft-header-content {
					display: flex;
					align-items: center;
					gap: 12px;
					color: white;
				}
				
				.craft-icon {
					flex-shrink: 0;
				}
				
				.craft-upload-header h2 {
					margin: 0;
					font-size: 1.25rem;
					font-weight: 600;
				}

				/* Form */
				.craft-upload-form {
					display: flex;
					flex-direction: column;
					gap: 24px;
				}

				/* Sections */
				.craft-upload-section {
					display: flex;
					flex-direction: column;
					gap: 12px;
				}

				.craft-section-header {
					display: flex;
					align-items: center;
					gap: 8px;
					font-weight: 500;
					color: var(--text-muted);
					font-size: 0.9rem;
				}

				/* Drop Zone */
				.craft-drop-zone {
					position: relative;
					border: 2px dashed var(--background-modifier-border);
					border-radius: 8px;
					padding: 32px 16px;
					text-align: center;
					transition: all 0.2s ease;
					cursor: pointer;
				}

				.craft-drop-zone:hover {
					border-color: #667eea;
					background: var(--background-modifier-hover);
				}

				.craft-drop-zone.drag-over {
					border-color: #667eea;
					background: var(--background-modifier-hover);
					transform: scale(1.02);
				}

				.craft-drop-content {
					display: flex;
					flex-direction: column;
					align-items: center;
					gap: 16px;
				}

				.craft-drop-icon {
					color: var(--text-muted);
				}

				.craft-drop-text .primary {
					font-weight: 500;
					margin: 0 0 4px 0;
				}

				.craft-drop-text .secondary {
					font-size: 0.85rem;
					color: var(--text-muted);
					margin: 0;
				}

				.craft-file-input {
					position: absolute;
					top: 0;
					left: 0;
					width: 100%;
					height: 100%;
					opacity: 0;
					cursor: pointer;
				}

				/* Inputs */
				.craft-url-input,
				.craft-filename-input {
					padding: 12px 16px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 6px;
					font-size: 0.9rem;
					transition: border-color 0.2s ease;
				}

				.craft-url-input:focus,
				.craft-filename-input:focus {
					outline: none;
					border-color: #667eea;
					box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
				}

				/* Preview */
				.craft-preview-container {
					border: 1px solid var(--background-modifier-border);
					border-radius: 8px;
					min-height: 120px;
					display: flex;
					align-items: center;
					justify-content: center;
					overflow: hidden;
				}

				.craft-preview-placeholder {
					display: flex;
					flex-direction: column;
					align-items: center;
					gap: 12px;
					color: var(--text-muted);
				}

				.craft-preview-placeholder p {
					margin: 0;
					font-size: 0.9rem;
				}

				.craft-preview-container img {
					max-width: 100%;
					max-height: 200px;
					border-radius: 6px;
				}

				/* Buttons */
				.craft-button-container {
					display: flex;
					gap: 12px;
					justify-content: flex-end;
					padding-top: 8px;
				}

				.craft-upload-btn {
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					color: white;
					border: none;
					padding: 12px 24px;
					border-radius: 6px;
					font-weight: 500;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.craft-upload-btn:hover {
					transform: translateY(-1px);
					box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
				}

				.craft-upload-btn:disabled {
					opacity: 0.6;
					cursor: not-allowed;
					transform: none;
				}

				.craft-cancel-btn {
					background: transparent;
					color: var(--text-muted);
					border: 1px solid var(--background-modifier-border);
					padding: 12px 24px;
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.craft-cancel-btn:hover {
					background: var(--background-modifier-hover);
					border-color: var(--text-muted);
				}
			`;
			document.head.appendChild(style);
		}
	}

	private setupEventListeners(
		fileInput: HTMLInputElement, 
		urlInput: HTMLInputElement, 
		filenameInput: HTMLInputElement, 
		dropZone: HTMLElement,
		uploadBtn: HTMLButtonElement, 
		cancelBtn: HTMLButtonElement
	) {
		// File input
		fileInput.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;
			if (target.files && target.files[0]) {
				this.selectedFile = target.files[0];
				this.filename = target.files[0].name;
				this.imageUrl = '';
				urlInput.value = '';
				filenameInput.value = this.filename;
				this.updatePreview();
			}
		});

		// Drag & drop
		dropZone.addEventListener('dragover', (e) => {
			e.preventDefault();
			dropZone.addClass('drag-over');
		});

		dropZone.addEventListener('dragleave', () => {
			dropZone.removeClass('drag-over');
		});

		dropZone.addEventListener('drop', (e) => {
			e.preventDefault();
			dropZone.removeClass('drag-over');
			
			const files = e.dataTransfer?.files;
			if (files && files[0] && files[0].type.startsWith('image/')) {
				this.selectedFile = files[0];
				this.filename = files[0].name;
				this.imageUrl = '';
				urlInput.value = '';
				filenameInput.value = this.filename;
				this.updatePreview();
			}
		});
		
		// URL input
		urlInput.addEventListener('input', () => {
			this.imageUrl = urlInput.value;
			if (this.imageUrl) {
				this.selectedFile = null;
				fileInput.value = '';
				
				// Better filename extraction from URL
				const urlFilename = extractFilenameFromUrl(this.imageUrl);
				this.filename = urlFilename;
				filenameInput.value = this.filename;
				this.updatePreview();
			}
		});
		
		// Filename input
		filenameInput.addEventListener('input', () => {
			this.filename = filenameInput.value;
		});

		// Buttons
		uploadBtn.addEventListener('click', async () => {
			await this.handleUpload();
		});

		cancelBtn.addEventListener('click', () => this.close());
	}

	private updatePreview() {
		if (!this.previewContainer) return;

		this.previewContainer.empty();

		if (this.selectedFile) {
			const reader = new FileReader();
			reader.onload = (e) => {
				const img = this.previewContainer.createEl('img');
				img.src = e.target?.result as string;
			};
			reader.readAsDataURL(this.selectedFile);
		} else if (this.imageUrl) {
			const img = this.previewContainer.createEl('img');
			img.src = this.imageUrl;
			img.onerror = () => {
				this.previewContainer.empty();
				this.previewContainer.createDiv('craft-preview-placeholder').innerHTML = `
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
						<circle cx="12" cy="12" r="10"/>
						<line x1="15" y1="9" x2="9" y2="15"/>
						<line x1="9" y1="9" x2="15" y2="15"/>
					</svg>
					<p>Could not load image from URL</p>
				`;
			};
		} else {
			this.previewContainer.createDiv('craft-preview-placeholder').innerHTML = `
				<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
					<circle cx="8.5" cy="8.5" r="1.5"/>
					<polyline points="21,15 16,10 5,21"/>
				</svg>
				<p>No image selected</p>
			`;
		}
	}

	private async handleUpload() {
		// Clean up the filename before validation
		this.filename = sanitizeFilename(this.filename);
		
		if (!this.filename) {
			new Notice('Please enter a filename');
			return;
		}

		if (!this.selectedFile && !this.imageUrl) {
			new Notice('Please select a file or enter a URL');
			return;
		}

		try {
			new Notice('Uploading image...');

			let result;
			if (this.selectedFile) {
				// Use ImageManager for local file upload
				console.log('📁 Using local file:', this.selectedFile.name);
				result = await this.imageManager.uploadFromFile(this.selectedFile);
			} else {
				// Use ImageManager for URL upload
				console.log('🌐 Using URL:', this.imageUrl);
				result = await this.imageManager.uploadFromUrl(this.imageUrl, this.filename);
			}

			// Generate asset code and insert into editor
			const assetCode = this.imageManager.generateAssetCode(result.id);
			this.editor.replaceSelection(assetCode);

			new Notice(`✅ Image uploaded! Asset ID: ${result.id}`);
			console.log('🎉 Asset code inserted:', assetCode);

			this.close();

		} catch (error) {
			console.error('💥 Upload failed:', error);
			new Notice(`Upload failed: ${error.message}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}