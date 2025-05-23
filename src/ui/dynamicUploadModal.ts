import { App, MarkdownView, Modal, Notice, TFile } from 'obsidian';
import CraftCMSPlugin from '../../main';
import { CraftContentType, FormFieldDefinition } from '../api/schemaIntrospector';
import { PostData } from '../api/types';
import { parseFrontmatter } from '../utils/frontmatter';
import { slugify } from '../utils/textUtils';

export class DynamicUploadModal extends Modal {
	private plugin: CraftCMSPlugin;
	private selectedContentType: CraftContentType | null = null;
	private availableContentTypes: CraftContentType[] = [];
	private formFields: FormFieldDefinition[] = [];
	private formData: Record<string, any> = {};
	private currentFile: TFile | null = null;
	private asDraft: boolean = false;

	constructor(app: App, plugin: CraftCMSPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Get current file first
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.file) {
			new Notice('No active file found');
			this.close();
			return;
		}
		this.currentFile = activeView.file;

		this.addModalStyles();
		await this.loadContentTypes();
		await this.prefillFromFrontmatter();
		this.render();

		// Apply sizing AFTER render when DOM is ready
		setTimeout(() => {
			// Target the actual modal content, not the shadow
			const modalEl = this.containerEl.querySelector('.modal') as HTMLElement;
			if (modalEl) {
				modalEl.style.maxWidth = '900px';
				modalEl.style.width = '900px';
				modalEl.style.minHeight = '600px';
				modalEl.addClass('mod-dynamic-upload-sized');
			}
		}, 50);
	}

	private async loadContentTypes() {
		try {
			new Notice('🔍 Loading content types...');
			this.availableContentTypes = await this.plugin.schemaManager.getContentTypesForSection(
				this.plugin.settings.sectionHandle
			);

			if (this.availableContentTypes.length === 0) {
				throw new Error('No content types found for this section');
			}

			// Default to the first content type (usually posts_posts)
			this.selectedContentType = this.availableContentTypes[0];
			await this.loadFormFields();

		} catch (error) {
			console.error('💥 Failed to load content types:', error);
			new Notice(`Failed to load content types: ${error.message}`);
			this.close();
		}
	}

	private async loadFormFields() {
		if (!this.selectedContentType) return;

		try {
			this.formFields = await this.plugin.schemaManager.getFormFields(this.selectedContentType.handle);
			console.log(`📋 Loaded ${this.formFields.length} fields for ${this.selectedContentType.name}`);
		} catch (error) {
			console.error('💥 Failed to load form fields:', error);
			new Notice(`Failed to load form fields: ${error.message}`);
		}
	}

	private async prefillFromFrontmatter() {
		if (!this.currentFile) return;

		try {
			const content = await this.app.vault.read(this.currentFile);
			const { frontmatter, body } = parseFrontmatter(content);

			// Pre-populate form with existing frontmatter
			this.formData = {
				title: frontmatter.title || this.currentFile.basename,
				body: body,
				slug: frontmatter.slug || slugify(frontmatter.title || this.currentFile.basename),
				deck: frontmatter.deck || '',
				shortDeck: frontmatter.shortDeck || frontmatter.description || '',
				metaHeadline: frontmatter.metaHeadline || frontmatter.title || '',
				metaDescription: frontmatter.metaDescription || frontmatter.description || '',
				postDate: frontmatter.postDate || frontmatter.date || new Date().toISOString().split('T')[0],
				enabled: frontmatter.enabled ?? true,
				tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.join(', ') : '',
				...frontmatter // Include any other custom fields
			};

		} catch (error) {
			console.error('⚠️ Failed to parse frontmatter:', error);
		}
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		// Header
		const header = contentEl.createDiv('dynamic-upload-header');
		header.innerHTML = `
			<div class="dynamic-header-content">
				<svg class="dynamic-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2L22 8.5V15.5L12 22L2 15.5V8.5L12 2Z"/>
					<path d="M12 8.5V22"/>
					<path d="M22 8.5L12 15L2 8.5"/>
				</svg>
				<div>
					<h2>Smart Upload</h2>
					<p>Dynamic form based on your content type</p>
				</div>
			</div>
		`;

		const content = contentEl.createDiv('dynamic-upload-content');

		// Content Type Selector
		this.renderContentTypeSelector(content);

		// Dynamic Form
		this.renderDynamicForm(content);

		// Upload Options
		this.renderUploadOptions(content);

		// Action Buttons
		this.renderActionButtons(content);
	}

	private renderContentTypeSelector(container: HTMLElement) {
		const section = container.createDiv('dynamic-section');
		section.createEl('h3', { text: '🎯 Content Type' });

		const selectorContainer = section.createDiv('content-type-selector');
		
		for (const contentType of this.availableContentTypes) {
			const option = selectorContainer.createDiv('content-type-option');
			if (contentType === this.selectedContentType) {
				option.addClass('selected');
			}

			option.innerHTML = `
				<div class="content-type-header">
					<h4>${contentType.name}</h4>
					<span class="field-count">${contentType.fields.length} fields</span>
				</div>
				<div class="content-type-handle">${contentType.handle}</div>
			`;

			option.addEventListener('click', async () => {
				// Update selection
				selectorContainer.querySelectorAll('.content-type-option').forEach(el => 
					el.removeClass('selected')
				);
				option.addClass('selected');

				this.selectedContentType = contentType;
				await this.loadFormFields();
				this.render(); // Re-render with new form fields
			});
		}
	}

	private renderDynamicForm(container: HTMLElement) {
		if (!this.selectedContentType || this.formFields.length === 0) return;

		const section = container.createDiv('dynamic-section');
		section.createEl('h3', { text: `📝 ${this.selectedContentType.name} Fields` });

		const form = section.createDiv('dynamic-form');

		// Group fields by importance
		const essentialFields = this.formFields.filter(f => 
			['title', 'body', 'slug'].includes(f.name) || f.required
		);
		const contentFields = this.formFields.filter(f => 
			!essentialFields.includes(f) && 
			['deck', 'shortDeck', 'metaHeadline', 'metaDescription'].includes(f.name)
		);
		const otherFields = this.formFields.filter(f => 
			!essentialFields.includes(f) && !contentFields.includes(f)
		);

		// Render essential fields first
		if (essentialFields.length > 0) {
			const essentialGroup = form.createDiv('field-group');
			essentialGroup.createEl('h4', { text: '⭐ Essential Fields', cls: 'field-group-title' });
			essentialFields.forEach(field => this.renderFormField(essentialGroup, field));
		}

		// Render content fields
		if (contentFields.length > 0) {
			const contentGroup = form.createDiv('field-group');
			contentGroup.createEl('h4', { text: '📄 Content Fields', cls: 'field-group-title' });
			contentFields.forEach(field => this.renderFormField(contentGroup, field));
		}

		// Render other fields in a collapsible section
		if (otherFields.length > 0) {
			const otherGroup = form.createDiv('field-group');
			const otherHeader = otherGroup.createEl('h4', { 
				text: `🔧 Additional Fields (${otherFields.length})`, 
				cls: 'field-group-title collapsible'
			});
			
			const otherFieldsContainer = otherGroup.createDiv('collapsible-content collapsed');
			otherFields.forEach(field => this.renderFormField(otherFieldsContainer, field));

			otherHeader.addEventListener('click', () => {
				const isCollapsed = otherFieldsContainer.hasClass('collapsed');
				otherFieldsContainer.toggleClass('collapsed', !isCollapsed);
				otherHeader.textContent = !isCollapsed 
					? `🔧 Additional Fields (${otherFields.length})` 
					: `🔧 Additional Fields (${otherFields.length}) ▼`;
			});
		}
	}

	private renderFormField(container: HTMLElement, field: FormFieldDefinition) {
		const fieldContainer = container.createDiv('form-field');
		
		// Use full-width layout for textareas and certain fields
		const fullWidthFields = ['body', 'content', 'metaDescription', 'metaCode'];
		const isFullWidth = field.type === 'textarea' || fullWidthFields.includes(field.name);
		
		if (isFullWidth) {
			fieldContainer.addClass('full-width');
		}
		
		const labelContainer = fieldContainer.createDiv('field-label-container');
		const label = labelContainer.createEl('label', { cls: 'field-label' });
		label.textContent = field.label;
		if (field.required) {
			label.createSpan({ text: ' *', cls: 'required-indicator' });
		}

		// Add description to label container if available
		if (field.description) {
			labelContainer.createEl('div', { 
				text: field.description, 
				cls: 'field-description' 
			});
		}

		const inputContainer = fieldContainer.createDiv('field-input-container');
		let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

		switch (field.type) {
			case 'textarea':
				input = inputContainer.createEl('textarea', { cls: 'field-input' });
				(input as HTMLTextAreaElement).rows = field.name === 'body' ? 8 : 4;
				break;
			case 'checkbox':
				input = inputContainer.createEl('input', { type: 'checkbox', cls: 'field-input' });
				break;
			case 'select':
				input = inputContainer.createEl('select', { cls: 'field-input' });
				if (field.options) {
					field.options.forEach(option => {
						const opt = (input as HTMLSelectElement).createEl('option');
						opt.value = option.value;
						opt.textContent = option.label;
					});
				}
				break;
			default:
				input = inputContainer.createEl('input', { 
					type: field.type, 
					cls: 'field-input'
				});
		}

		// Set placeholder (only for input and textarea)
		if (field.placeholder && (field.type !== 'select' && field.type !== 'checkbox')) {
			(input as HTMLInputElement | HTMLTextAreaElement).placeholder = field.placeholder;
		}

		// Set initial value
		const initialValue = this.formData[field.name];
		if (initialValue !== undefined) {
			if (field.type === 'checkbox') {
				(input as HTMLInputElement).checked = Boolean(initialValue);
			} else {
				input.value = String(initialValue);
			}
		}

		// Store value changes
		input.addEventListener('change', () => {
			if (field.type === 'checkbox') {
				this.formData[field.name] = (input as HTMLInputElement).checked;
			} else {
				this.formData[field.name] = input.value;
			}
		});
	}

	private renderUploadOptions(container: HTMLElement) {
		const section = container.createDiv('dynamic-section');
		section.createEl('h3', { text: '⚙️ Upload Options' });

		const optionsContainer = section.createDiv('upload-options');

		// Draft toggle
		const draftOption = optionsContainer.createDiv('upload-option');
		const draftLabel = draftOption.createEl('label', { cls: 'option-label' });
		const draftCheckbox = draftLabel.createEl('input', { type: 'checkbox' });
		draftCheckbox.checked = this.asDraft;
		draftCheckbox.addEventListener('change', () => {
			this.asDraft = draftCheckbox.checked;
		});
		draftLabel.createSpan({ text: 'Save as draft' });

		// Show validation status
		if (this.selectedContentType) {
			this.showValidationStatus(optionsContainer);
		}
	}

	private async showValidationStatus(container: HTMLElement) {
		if (!this.selectedContentType) return;

		try {
			const validation = await this.plugin.schemaManager.validateContentTypeForUpload(
				this.selectedContentType.handle
			);

			const statusContainer = container.createDiv('validation-status');
			
			if (validation.valid) {
				statusContainer.innerHTML = `
					<div class="validation-success">
						✅ Content type validated - ready for upload
					</div>
				`;
			} else {
				statusContainer.innerHTML = `
					<div class="validation-error">
						❌ Validation issues: ${validation.errors.join(', ')}
					</div>
				`;
			}

			if (validation.warnings && validation.warnings.length > 0) {
				statusContainer.createDiv('validation-warnings').innerHTML = `
					⚠️ Warnings: ${validation.warnings.join(', ')}
				`;
			}

		} catch (error) {
			console.error('Validation check failed:', error);
		}
	}

	private renderActionButtons(container: HTMLElement) {
		const buttonContainer = container.createDiv('dynamic-buttons');

		const uploadBtn = buttonContainer.createEl('button', {
			text: '🚀 Smart Upload',
			cls: 'dynamic-upload-btn'
		});

		uploadBtn.addEventListener('click', async () => {
			await this.handleUpload();
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'dynamic-cancel-btn'
		});

		cancelBtn.addEventListener('click', () => this.close());
	}

	private async handleUpload() {
		if (!this.selectedContentType || !this.currentFile) {
			new Notice('Missing required data for upload');
			return;
		}

		try {
			new Notice('🚀 Starting smart upload...');

			// Convert form data to PostData format
			const postData: PostData = {
				title: this.formData.title || '',
				body: this.formData.body || '',
				deck: this.formData.deck,
				shortDeck: this.formData.shortDeck,
				slug: this.formData.slug,
				metaHeadline: this.formData.metaHeadline,
				metaDescription: this.formData.metaDescription,
				tags: this.formData.tags ? this.formData.tags.split(',').map((t: string) => t.trim()) : [],
				enabled: this.asDraft ? false : (this.formData.enabled ?? true),
				postDate: this.formData.postDate || new Date().toISOString(),
				// Include any other custom fields
				...Object.fromEntries(
					Object.entries(this.formData).filter(([key]) => 
						!['title', 'body', 'deck', 'shortDeck', 'slug', 'metaHeadline', 
						  'metaDescription', 'tags', 'enabled', 'postDate'].includes(key)
					)
				)
			};

			console.log('📤 Smart upload data:', postData);

			// Use the existing upload logic but with our dynamic data
			await this.plugin.uploadPost(this.currentFile, { asDraft: this.asDraft });

			new Notice(`✅ Successfully uploaded as ${this.selectedContentType.name}!`);
			this.close();

		} catch (error) {
			console.error('💥 Smart upload failed:', error);
			new Notice(`Upload failed: ${error.message}`);
		}
	}

	private addModalStyles() {
		if (!document.querySelector('#dynamic-upload-modal-css')) {
			const style = document.createElement('style');
			style.id = 'dynamic-upload-modal-css';
			style.textContent = `
				/* Modal sizing - Target the right elements */
				.modal.mod-dynamic-upload-sized {
					max-width: 900px !important;
					width: 900px !important;
					min-height: 600px !important;
				}

				.modal.mod-dynamic-upload-sized .modal-content {
					padding: 0 !important;
					max-width: none !important;
					width: 100% !important;
				}

				.dynamic-upload-header {
					background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
					margin: -20px -20px 20px -20px;
					padding: 20px;
					border-radius: 8px 8px 0 0;
					color: white;
				}

				.dynamic-header-content {
					display: flex;
					align-items: center;
					gap: 16px;
				}

				.dynamic-header-content h2 {
					margin: 0 0 4px 0;
					font-size: 1.5rem;
				}

				.dynamic-header-content p {
					margin: 0;
					opacity: 0.9;
				}

				.dynamic-upload-content {
					max-height: 75vh;
					overflow-y: auto;
					padding: 0 24px 24px;
					width: 100%;
				}

				.dynamic-section {
					margin-bottom: 24px;
				}

				.dynamic-section h3 {
					margin: 0 0 16px 0;
					color: var(--text-normal);
					font-size: 1.1rem;
				}

				/* Content Type Selector */
				.content-type-selector {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
					gap: 16px;
					margin-bottom: 24px;
				}

				.content-type-option {
					padding: 16px;
					border: 2px solid var(--background-modifier-border);
					border-radius: 8px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.content-type-option:hover {
					border-color: var(--interactive-accent);
					background: var(--background-modifier-hover);
				}

				.content-type-option.selected {
					border-color: var(--interactive-accent);
					background: var(--interactive-accent-hover);
				}

				.content-type-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 4px;
				}

				.content-type-header h4 {
					margin: 0;
					font-size: 1rem;
				}

				.field-count {
					font-size: 0.85rem;
					color: var(--text-muted);
					background: var(--background-secondary);
					padding: 2px 8px;
					border-radius: 12px;
				}

				.content-type-handle {
					font-family: monospace;
					font-size: 0.85rem;
					color: var(--text-muted);
				}

				/* Dynamic Form */
				.dynamic-form {
					display: flex;
					flex-direction: column;
					gap: 24px;
				}

				.field-group {
					border: 1px solid var(--background-modifier-border);
					border-radius: 8px;
					overflow: hidden;
				}

				.field-group-title {
					margin: 0;
					padding: 12px 16px;
					background: var(--background-secondary);
					font-size: 0.9rem;
					font-weight: 600;
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.field-group-title.collapsible {
					cursor: pointer;
					user-select: none;
				}

				.field-group-title.collapsible:hover {
					background: var(--background-modifier-hover);
				}

				.collapsible-content {
					max-height: 2000px;
					overflow: hidden;
					transition: max-height 0.3s ease;
				}

				.collapsible-content.collapsed {
					max-height: 0;
				}

				.form-field {
					padding: 24px;
					border-bottom: 1px solid var(--background-modifier-border);
					display: grid;
					grid-template-columns: 200px 1fr;
					gap: 20px;
					align-items: start;
				}

				.form-field:last-child {
					border-bottom: none;
				}

				/* Single column layout for textarea and complex fields */
				.form-field.full-width {
					grid-template-columns: 1fr;
					gap: 8px;
				}

				.field-label {
					display: block;
					margin-bottom: 4px;
					font-weight: 600;
					color: var(--text-normal);
					line-height: 1.4;
				}

				.required-indicator {
					color: var(--text-error);
				}

				.field-input {
					width: 100%;
					padding: 12px 16px;
					border: 2px solid var(--background-modifier-border);
					border-radius: 6px;
					font-size: 14px;
					background: var(--background-primary);
					color: var(--text-normal);
					transition: border-color 0.2s ease, box-shadow 0.2s ease;
				}

				.field-input:focus {
					outline: none;
					border-color: var(--interactive-accent);
					box-shadow: 0 0 0 3px var(--interactive-accent-hover);
				}

				.field-input[type="checkbox"] {
					width: auto;
					margin-right: 8px;
				}

				.field-description {
					margin-top: 4px;
					font-size: 12px;
					color: var(--text-muted);
					line-height: 1.4;
				}

				.field-input-container {
					min-width: 0; /* Prevents overflow in grid */
				}

				.field-label-container {
					min-width: 0; /* Prevents overflow in grid */
				}

				/* Upload Options */
				.upload-options {
					display: flex;
					flex-direction: column;
					gap: 12px;
				}

				.upload-option {
					display: flex;
					align-items: center;
				}

				.option-label {
					display: flex;
					align-items: center;
					cursor: pointer;
					font-weight: 500;
				}

				.validation-status {
					margin-top: 12px;
				}

				.validation-success {
					color: var(--text-success);
					padding: 8px 12px;
					background: rgba(34, 197, 94, 0.1);
					border-radius: 4px;
					border: 1px solid rgba(34, 197, 94, 0.2);
				}

				.validation-error {
					color: var(--text-error);
					padding: 8px 12px;
					background: rgba(239, 68, 68, 0.1);
					border-radius: 4px;
					border: 1px solid rgba(239, 68, 68, 0.2);
				}

				.validation-warnings {
					color: var(--text-warning);
					padding: 8px 12px;
					background: rgba(245, 158, 11, 0.1);
					border-radius: 4px;
					border: 1px solid rgba(245, 158, 11, 0.2);
					margin-top: 8px;
				}

				/* Action Buttons */
				.dynamic-buttons {
					display: flex;
					gap: 12px;
					justify-content: flex-end;
					margin-top: 24px;
					padding-top: 16px;
					border-top: 1px solid var(--background-modifier-border);
				}

				.dynamic-upload-btn {
					background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
					color: white;
					border: none;
					padding: 12px 24px;
					border-radius: 6px;
					font-weight: 500;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.dynamic-upload-btn:hover {
					transform: translateY(-1px);
					box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
				}

				.dynamic-cancel-btn {
					background: transparent;
					color: var(--text-muted);
					border: 1px solid var(--background-modifier-border);
					padding: 12px 24px;
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.dynamic-cancel-btn:hover {
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