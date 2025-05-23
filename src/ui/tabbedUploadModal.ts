import { App, MarkdownView, Modal, Notice, TFile } from 'obsidian';
import CraftCMSPlugin from '../../main';
import { CraftContentType, FormFieldDefinition } from '../api/schemaIntrospector';
import { PostData } from '../api/types';
import { parseFrontmatter } from '../utils/frontmatter';
import { slugify } from '../utils/textUtils';

export class TabbedUploadModal extends Modal {
	private plugin: CraftCMSPlugin;
	private selectedContentType: CraftContentType | null = null;
	private availableContentTypes: CraftContentType[] = [];
	private formFields: FormFieldDefinition[] = [];
	private formData: Record<string, any> = {};
	private currentFile: TFile | null = null;
	private asDraft: boolean = false;
	private activeTab: string = 'article';

	// Tab configuration matching Craft CMS style
	private tabs: Record<string, { name: string; icon: string; fields: string[] }> = {
		article: {
			name: 'Article',
			icon: '📄',
			fields: ['title', 'body', 'deck', 'shortDeck', 'slug', 'postDate', 'enabled']
		},
		meta: {
			name: 'Meta',
			icon: '🎯', 
			fields: ['metaHeadline', 'metaDescription', 'metaCode', 'featuredUrl']
		},
		social: {
			name: 'Social',
			icon: '📱',
			fields: ['socialBlurb', 'numberBlurb', 'repost', 'renderEmail']
		},
		taxonomy: {
			name: 'Taxonomy',
			icon: '🏷️',
			fields: ['tags', 'category', 'postAuthor']
		},
		media: {
			name: 'Media',
			icon: '🖼️',
			fields: ['image', 'featuredImage', 'sidebarAd', 'topAd']
		},
		advanced: {
			name: 'Advanced',
			icon: '⚙️',
			fields: [] as string[] // Explicitly typed as string array
		}
	};

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
		this.organizeFieldsByTabs();
		this.render();

		// Apply sizing AFTER render
		setTimeout(() => {
			const modalEl = this.containerEl.querySelector('.modal') as HTMLElement;
			if (modalEl) {
				modalEl.style.maxWidth = '1000px';
				modalEl.style.width = '1000px';
				modalEl.style.minHeight = '700px';
				modalEl.addClass('mod-tabbed-upload');
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
				...frontmatter
			};

		} catch (error) {
			console.error('⚠️ Failed to parse frontmatter:', error);
		}
	}

	private organizeFieldsByTabs() {
		// Get all field names that are assigned to specific tabs
		const assignedFields = new Set();
		Object.values(this.tabs).forEach(tab => {
			if (tab.fields) {
				tab.fields.forEach(field => assignedFields.add(field));
			}
		});

		// Put remaining fields in advanced tab
		this.tabs.advanced.fields = this.formFields
			.filter(field => !assignedFields.has(field.name))
			.map(field => field.name);
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		// Header with content type selector
		this.renderHeader(contentEl);

		// Main content area with tabs
		const mainContent = contentEl.createDiv('tabbed-main-content');
		
		// Tab navigation
		this.renderTabNavigation(mainContent);
		
		// Tab content
		this.renderTabContent(mainContent);

		// Footer with actions
		this.renderFooter(contentEl);
	}

	private renderHeader(container: HTMLElement) {
		const header = container.createDiv('tabbed-upload-header');
		header.innerHTML = `
			<div class="tabbed-header-content">
				<div class="header-left">
					<svg class="craft-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 2L22 8.5V15.5L12 22L2 15.5V8.5L12 2Z"/>
						<path d="M12 8.5V22"/>
						<path d="M22 8.5L12 15L2 8.5"/>
					</svg>
					<div>
						<h2>Smart Upload</h2>
						<p>Professional content management interface</p>
					</div>
				</div>
				<div class="header-right">
					<select class="content-type-select">
						${this.availableContentTypes.map(ct => 
							`<option value="${ct.handle}" ${ct === this.selectedContentType ? 'selected' : ''}>
								${ct.name} (${ct.fields.length} fields)
							</option>`
						).join('')}
					</select>
				</div>
			</div>
		`;

		// Handle content type change
		const select = header.querySelector('.content-type-select') as HTMLSelectElement;
		select.addEventListener('change', async () => {
			const selectedHandle = select.value;
			this.selectedContentType = this.availableContentTypes.find(ct => ct.handle === selectedHandle) || null;
			if (this.selectedContentType) {
				await this.loadFormFields();
				this.organizeFieldsByTabs();
				this.render();
			}
		});
	}

	private renderTabNavigation(container: HTMLElement) {
		const tabNav = container.createDiv('tab-navigation');
		
		Object.entries(this.tabs).forEach(([tabKey, tab]) => {
			const fieldsInTab = this.getFieldsForTab(tabKey);
			if (fieldsInTab.length === 0 && tabKey !== 'article') return; // Skip empty tabs except article
			
			const tabBtn = tabNav.createDiv('tab-button');
			if (tabKey === this.activeTab) {
				tabBtn.addClass('active');
			}
			
			tabBtn.innerHTML = `
				<span class="tab-icon">${tab.icon}</span>
				<span class="tab-name">${tab.name}</span>
				<span class="tab-count">${fieldsInTab.length}</span>
			`;
			
			tabBtn.addEventListener('click', () => {
				this.activeTab = tabKey;
				this.render();
			});
		});
	}

	private renderTabContent(container: HTMLElement) {
		const tabContent = container.createDiv('tab-content');
		const fieldsInTab = this.getFieldsForTab(this.activeTab);
		
		if (fieldsInTab.length === 0) {
			const currentTab = this.tabs[this.activeTab];
			if (!currentTab) return;
			
			tabContent.innerHTML = `
				<div class="empty-tab">
					<div class="empty-tab-icon">${currentTab.icon}</div>
					<h3>No fields in ${currentTab.name}</h3>
					<p>This content type doesn't have fields for this category.</p>
				</div>
			`;
			return;
		}

		// Render fields in a nice grid
		const fieldsGrid = tabContent.createDiv('fields-grid');
		
		fieldsInTab.forEach(field => {
			this.renderFormField(fieldsGrid, field);
		});

		// Special handling for article tab - add upload options
		if (this.activeTab === 'article') {
			this.renderUploadOptionsInTab(tabContent);
		}
	}

	private getFieldsForTab(tabKey: string): FormFieldDefinition[] {
		const tab = this.tabs[tabKey];
		if (!tab) return [];
		
		const tabFieldNames = tab.fields;
		return this.formFields.filter(field => tabFieldNames.includes(field.name));
	}

	private renderFormField(container: HTMLElement, field: FormFieldDefinition) {
		const fieldContainer = container.createDiv('tab-form-field');
		
		// Field header
		const fieldHeader = fieldContainer.createDiv('field-header');
		const label = fieldHeader.createEl('label', { cls: 'field-label' });
		label.innerHTML = `
			<span class="field-name">${field.label}</span>
			${field.required ? '<span class="required-indicator">*</span>' : ''}
		`;
		
		if (field.description) {
			fieldHeader.createEl('div', { 
				text: field.description, 
				cls: 'field-description' 
			});
		}

		// Field input
		let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
		const inputContainer = fieldContainer.createDiv('field-input-container');

		switch (field.type) {
			case 'textarea':
				input = inputContainer.createEl('textarea', { cls: 'field-input' });
				(input as HTMLTextAreaElement).rows = field.name === 'body' ? 8 : 4;
				break;
			case 'checkbox':
				const checkboxContainer = inputContainer.createDiv('checkbox-container');
				input = checkboxContainer.createEl('input', { type: 'checkbox', cls: 'field-checkbox' });
				checkboxContainer.createSpan({ text: 'Enable', cls: 'checkbox-label' });
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

		// Set placeholder and initial value
		if (field.placeholder && (field.type !== 'select' && field.type !== 'checkbox')) {
			(input as HTMLInputElement | HTMLTextAreaElement).placeholder = field.placeholder;
		}

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

	private renderUploadOptionsInTab(container: HTMLElement) {
		const optionsSection = container.createDiv('upload-options-section');
		optionsSection.createEl('h3', { text: '⚙️ Upload Options' });

		const optionsGrid = optionsSection.createDiv('options-grid');
		
		// Draft toggle
		const draftOption = optionsGrid.createDiv('option-card');
		draftOption.innerHTML = `
			<div class="option-header">
				<span class="option-icon">📝</span>
				<span class="option-title">Save as Draft</span>
			</div>
			<div class="option-description">Post will be saved but not published</div>
		`;
		
		const draftCheckbox = draftOption.createEl('input', { type: 'checkbox', cls: 'option-checkbox' });
		draftCheckbox.checked = this.asDraft;
		draftCheckbox.addEventListener('change', () => {
			this.asDraft = draftCheckbox.checked;
		});

		// Validation status
		this.showValidationStatus(optionsGrid);
	}

	private async showValidationStatus(container: HTMLElement) {
		if (!this.selectedContentType) return;

		try {
			const validation = await this.plugin.schemaManager.validateContentTypeForUpload(
				this.selectedContentType.handle
			);

			const statusCard = container.createDiv('status-card');
			
			if (validation.valid) {
				statusCard.addClass('status-success');
				statusCard.innerHTML = `
					<div class="status-header">
						<span class="status-icon">✅</span>
						<span class="status-title">Ready for Upload</span>
					</div>
					<div class="status-description">Content type validated successfully</div>
				`;
			} else {
				statusCard.addClass('status-error');
				statusCard.innerHTML = `
					<div class="status-header">
						<span class="status-icon">❌</span>
						<span class="status-title">Validation Issues</span>
					</div>
					<div class="status-description">${validation.errors.join(', ')}</div>
				`;
			}

			if (validation.warnings && validation.warnings.length > 0) {
				const warningCard = container.createDiv('status-card status-warning');
				warningCard.innerHTML = `
					<div class="status-header">
						<span class="status-icon">⚠️</span>
						<span class="status-title">Warnings</span>
					</div>
					<div class="status-description">${validation.warnings.join(', ')}</div>
				`;
			}

		} catch (error) {
			console.error('Validation check failed:', error);
		}
	}

	private renderFooter(container: HTMLElement) {
		const footer = container.createDiv('tabbed-footer');
		
		const footerLeft = footer.createDiv('footer-left');
		footerLeft.innerHTML = `
			<span class="footer-info">${this.selectedContentType?.name} • ${this.formFields.length} fields</span>
		`;

		const footerRight = footer.createDiv('footer-right');
		
		const uploadBtn = footerRight.createEl('button', {
			text: '🚀 Smart Upload',
			cls: 'footer-upload-btn'
		});
		
		uploadBtn.addEventListener('click', async () => {
			await this.handleUpload();
		});

		const cancelBtn = footerRight.createEl('button', {
			text: 'Cancel',
			cls: 'footer-cancel-btn'
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

			// Convert form data to PostData format (same as before)
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
				...Object.fromEntries(
					Object.entries(this.formData).filter(([key]) => 
						!['title', 'body', 'deck', 'shortDeck', 'slug', 'metaHeadline', 
						  'metaDescription', 'tags', 'enabled', 'postDate'].includes(key)
					)
				)
			};

			await this.plugin.uploadPost(this.currentFile, { asDraft: this.asDraft });
			new Notice(`✅ Successfully uploaded as ${this.selectedContentType.name}!`);
			this.close();

		} catch (error) {
			console.error('💥 Smart upload failed:', error);
			new Notice(`Upload failed: ${error.message}`);
		}
	}

	private addModalStyles() {
		if (!document.querySelector('#tabbed-upload-modal-css')) {
			const style = document.createElement('style');
			style.id = 'tabbed-upload-modal-css';
			style.textContent = `
				/* Modal sizing */
				.modal.mod-tabbed-upload {
					max-width: 1000px !important;
					width: 1000px !important;
					min-height: 700px !important;
				}

				.modal.mod-tabbed-upload .modal-content {
					padding: 0 !important;
					max-width: none !important;
					width: 100% !important;
				}

				/* Header */
				.tabbed-upload-header {
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					padding: 20px 24px;
					color: white;
				}

				.tabbed-header-content {
					display: flex;
					justify-content: space-between;
					align-items: center;
				}

				.header-left {
					display: flex;
					align-items: center;
					gap: 16px;
				}

				.header-left h2 {
					margin: 0 0 4px 0;
					font-size: 1.5rem;
				}

				.header-left p {
					margin: 0;
					opacity: 0.9;
				}

				.content-type-select {
					background: rgba(255, 255, 255, 0.2);
					border: 1px solid rgba(255, 255, 255, 0.3);
					color: white;
					padding: 8px 12px;
					border-radius: 6px;
					font-size: 0.9rem;
				}

				.content-type-select option {
					background: var(--background-primary);
					color: var(--text-normal);
				}

				/* Main content */
				.tabbed-main-content {
					display: flex;
					height: 600px;
				}

				/* Tab navigation */
				.tab-navigation {
					width: 200px;
					background: var(--background-secondary);
					border-right: 1px solid var(--background-modifier-border);
					padding: 16px 0;
					overflow-y: auto;
				}

				.tab-button {
					padding: 12px 20px;
					cursor: pointer;
					display: flex;
					align-items: center;
					gap: 12px;
					transition: all 0.2s ease;
					border-left: 3px solid transparent;
				}

				.tab-button:hover {
					background: var(--background-modifier-hover);
				}

				.tab-button.active {
					background: var(--interactive-accent-hover);
					border-left-color: var(--interactive-accent);
					color: var(--interactive-accent);
				}

				.tab-icon {
					font-size: 1.1rem;
				}

				.tab-name {
					font-weight: 500;
					flex: 1;
				}

				.tab-count {
					background: var(--background-modifier-border);
					padding: 2px 6px;
					border-radius: 10px;
					font-size: 0.75rem;
					min-width: 20px;
					text-align: center;
				}

				.tab-button.active .tab-count {
					background: var(--interactive-accent);
					color: white;
				}

				/* Tab content */
				.tab-content {
					flex: 1;
					padding: 24px;
					overflow-y: auto;
				}

				.empty-tab {
					text-align: center;
					padding: 60px 20px;
					color: var(--text-muted);
				}

				.empty-tab-icon {
					font-size: 3rem;
					margin-bottom: 16px;
				}

				.empty-tab h3 {
					margin: 0 0 8px 0;
				}

				/* Fields grid */
				.fields-grid {
					display: grid;
					gap: 24px;
				}

				.tab-form-field {
					border: 1px solid var(--background-modifier-border);
					border-radius: 8px;
					padding: 20px;
					background: var(--background-primary);
				}

				.field-header {
					margin-bottom: 12px;
				}

				.field-label {
					display: block;
					margin-bottom: 4px;
				}

				.field-name {
					font-weight: 600;
					color: var(--text-normal);
				}

				.required-indicator {
					color: var(--text-error);
					margin-left: 4px;
				}

				.field-description {
					font-size: 0.85rem;
					color: var(--text-muted);
					margin-top: 4px;
				}

				.field-input {
					width: 100%;
					padding: 12px 16px;
					border: 2px solid var(--background-modifier-border);
					border-radius: 6px;
					font-size: 14px;
					background: var(--background-primary);
					color: var(--text-normal);
					transition: border-color 0.2s ease;
				}

				.field-input:focus {
					outline: none;
					border-color: var(--interactive-accent);
					box-shadow: 0 0 0 3px var(--interactive-accent-hover);
				}

				.checkbox-container {
					display: flex;
					align-items: center;
					gap: 8px;
				}

				.field-checkbox {
					width: auto !important;
				}

				.checkbox-label {
					font-weight: 500;
				}

				/* Upload options */
				.upload-options-section {
					margin-top: 32px;
					padding-top: 24px;
					border-top: 1px solid var(--background-modifier-border);
				}

				.upload-options-section h3 {
					margin: 0 0 16px 0;
				}

				.options-grid {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
					gap: 16px;
				}

				.option-card,
				.status-card {
					border: 1px solid var(--background-modifier-border);
					border-radius: 8px;
					padding: 16px;
					position: relative;
				}

				.option-header,
				.status-header {
					display: flex;
					align-items: center;
					gap: 8px;
					margin-bottom: 4px;
				}

				.option-title,
				.status-title {
					font-weight: 500;
				}

				.option-description,
				.status-description {
					font-size: 0.85rem;
					color: var(--text-muted);
				}

				.option-checkbox {
					position: absolute;
					top: 16px;
					right: 16px;
				}

				.status-card.status-success {
					border-color: var(--text-success);
					background: rgba(34, 197, 94, 0.1);
				}

				.status-card.status-error {
					border-color: var(--text-error);
					background: rgba(239, 68, 68, 0.1);
				}

				.status-card.status-warning {
					border-color: var(--text-warning);
					background: rgba(245, 158, 11, 0.1);
				}

				/* Footer */
				.tabbed-footer {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 16px 24px;
					border-top: 1px solid var(--background-modifier-border);
					background: var(--background-secondary);
				}

				.footer-info {
					font-size: 0.85rem;
					color: var(--text-muted);
				}

				.footer-right {
					display: flex;
					gap: 12px;
				}

				.footer-upload-btn {
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					color: white;
					border: none;
					padding: 12px 24px;
					border-radius: 6px;
					font-weight: 500;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.footer-upload-btn:hover {
					transform: translateY(-1px);
					box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
				}

				.footer-cancel-btn {
					background: transparent;
					color: var(--text-muted);
					border: 1px solid var(--background-modifier-border);
					padding: 12px 24px;
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.footer-cancel-btn:hover {
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