import { App, MarkdownView, Modal, Notice } from 'obsidian';
import CraftCMSPlugin from '../../main';

export class UploadModal extends Modal {
	plugin: CraftCMSPlugin;
	asDraft: boolean = false;

	constructor(app: App, plugin: CraftCMSPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add custom styles
		this.addModalStyles();

		// Header
		const header = contentEl.createDiv('craft-modal-header');
		header.innerHTML = `
			<div class="craft-header-content">
				<svg class="craft-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
					<polyline points="17,8 12,3 7,8"/>
					<line x1="12" y1="3" x2="12" y2="15"/>
				</svg>
				<h2>Upload to Craft CMS</h2>
			</div>
		`;

		const form = contentEl.createDiv('craft-upload-form');

		// Post preview
		this.addPostPreview(form);

		// Upload options
		this.addUploadOptions(form);

		// Buttons
		this.addButtons(form);
	}

	private addPostPreview(container: HTMLElement) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.file) return;

		const previewSection = container.createDiv('craft-preview-section');
		previewSection.createEl('h3', { text: '📄 Post Preview' });

		const previewCard = previewSection.createDiv('craft-preview-card');
		
		// File info
		const fileInfo = previewCard.createDiv('craft-file-info');
		fileInfo.innerHTML = `
			<div class="craft-file-name">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
					<polyline points="14,2 14,8 20,8"/>
				</svg>
				<span>${activeView.file.basename}</span>
			</div>
			<div class="craft-file-path">${activeView.file.path}</div>
		`;

		// Quick stats (we could add word count, etc. here)
		const stats = previewCard.createDiv('craft-preview-stats');
		stats.innerHTML = `
			<div class="craft-stat">
				<span class="craft-stat-label">Status:</span>
				<span class="craft-stat-value">Ready to upload</span>
			</div>
		`;
	}

	private addUploadOptions(container: HTMLElement) {
		const optionsSection = container.createDiv('craft-options-section');
		optionsSection.createEl('h3', { text: '⚙️ Upload Options' });

		const optionsCard = optionsSection.createDiv('craft-options-card');

		// Draft toggle
		const draftOption = optionsCard.createDiv('craft-option');
		const draftLabel = draftOption.createEl('label', { cls: 'craft-option-label' });
		
		const draftCheckbox = draftLabel.createEl('input', { type: 'checkbox' });
		draftCheckbox.addEventListener('change', () => {
			this.asDraft = draftCheckbox.checked;
		});

		draftLabel.createSpan({ text: 'Upload as draft' });
		draftOption.createDiv('craft-option-desc').textContent = 'Post will be saved but not published';

		// Future options can go here (force new, different section, etc.)
	}

	private addButtons(container: HTMLElement) {
		const buttonContainer = container.createDiv('craft-modal-buttons');
		
		const uploadBtn = buttonContainer.createEl('button', {
			text: '🚀 Upload Post',
			cls: 'craft-upload-btn mod-cta'
		});
		
		uploadBtn.addEventListener('click', async () => {
			await this.handleUpload();
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'craft-cancel-btn'
		});
		
		cancelBtn.addEventListener('click', () => this.close());
	}

	private async handleUpload() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.file) {
			new Notice('No active file found');
			return;
		}

		this.close();
		
		try {
			await this.plugin.uploadPost(activeView.file, { asDraft: this.asDraft });
		} catch (error) {
			new Notice(`Upload failed: ${error.message}`);
		}
	}

	private addModalStyles() {
		if (!document.querySelector('#craft-upload-modal-css')) {
			const style = document.createElement('style');
			style.id = 'craft-upload-modal-css';
			style.textContent = `
				.craft-modal-header {
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
				
				.craft-upload-form {
					display: flex;
					flex-direction: column;
					gap: 24px;
				}

				.craft-preview-section,
				.craft-options-section {
					display: flex;
					flex-direction: column;
					gap: 12px;
				}

				.craft-preview-section h3,
				.craft-options-section h3 {
					margin: 0;
					font-size: 1rem;
					font-weight: 600;
					color: var(--text-normal);
				}

				.craft-preview-card,
				.craft-options-card {
					background: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 8px;
					padding: 16px;
				}

				.craft-file-info {
					display: flex;
					flex-direction: column;
					gap: 4px;
				}

				.craft-file-name {
					display: flex;
					align-items: center;  
					gap: 8px;
					font-weight: 500;
				}

				.craft-file-path {
					font-size: 0.85rem;
					color: var(--text-muted);
					margin-left: 24px;
				}

				.craft-preview-stats {
					margin-top: 12px;
					padding-top: 12px;
					border-top: 1px solid var(--background-modifier-border);
				}

				.craft-stat {
					display: flex;
					justify-content: space-between;
					align-items: center;
				}

				.craft-stat-label {
					color: var(--text-muted);
				}

				.craft-stat-value {
					font-weight: 500;
					color: var(--text-success);
				}

				.craft-option {
					display: flex;
					flex-direction: column;
					gap: 4px;
				}

				.craft-option-label {
					display: flex;
					align-items: center;
					gap: 8px;
					cursor: pointer;
					font-weight: 500;
				}

				.craft-option-desc {
					font-size: 0.85rem;
					color: var(--text-muted);
					margin-left: 24px;
				}

				.craft-modal-buttons {
					display: flex;
					gap: 12px;
					justify-content: flex-end;
					padding-top: 8px;
					border-top: 1px solid var(--background-modifier-border);
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

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}