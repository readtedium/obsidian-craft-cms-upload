import { App, MarkdownView, Modal, Notice, TFile, requestUrl } from 'obsidian';
import CraftCMSPlugin from '../../main';
import { CraftContentType, FormFieldDefinition } from '../api/schemaIntrospector';
import { PostData } from '../api/types';
import { parseFrontmatter, updateFrontmatter } from '../utils/frontmatter';
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
	private dropdownOptions: Record<string, Array<{value: string, label: string, url?: string, filename?: string, width?: number, height?: number}>> = {};

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
			fields: ['tags', 'category', 'postAuthor', 'categories']
		},
		media: {
			name: 'Media',
			icon: '🖼️',
			fields: ['image', 'featuredImage', 'sidebarAd', 'topAd']
		},
		advanced: {
			name: 'Advanced',
			icon: '⚙️',
			fields: [] as string[]
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
		await this.loadDropdownOptions();
		await this.prefillFromFrontmatter();
		this.organizeFieldsByTabs();
		this.render();

		// Apply sizing AFTER render
		setTimeout(() => {
			const modalEl = this.containerEl.querySelector('.modal') as HTMLElement;
			if (modalEl) {
				modalEl.style.maxWidth = '1200px';
				modalEl.style.width = '1200px';
				modalEl.style.minHeight = '800px';
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

	private async loadDropdownOptions() {
		try {
			console.log('🔍 Loading dropdown options...');
			
			this.dropdownOptions = {};
			
			await Promise.all([
				this.loadAuthors(),
				this.loadCategories(),
				this.loadAssets() // Add asset loading
			]);
			
			console.log('📋 Loaded dropdown options:', this.dropdownOptions);
		} catch (error) {
			console.error('⚠️ Failed to load dropdown options:', error);
		}
	}

	private async loadAuthors() {
		try {
			const authorsQuery = `
				query GetAuthors {
					entries(section: "author", limit: 50) {
						id
						title
						... on author_author_Entry {
							firstName
							lastName
						}
					}
				}
			`;

			const response = await requestUrl({
				url: this.plugin.settings.endpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.plugin.settings.token}`
				},
				body: JSON.stringify({
					query: authorsQuery
				})
			});
			
			if (response.json?.data?.entries) {
				const authors = response.json.data.entries.map((author: any) => {
					const displayName = author.firstName && author.lastName 
						? `${author.firstName} ${author.lastName}` 
						: author.title;
					
					return {
						value: author.id,
						label: displayName
					};
				});

				this.dropdownOptions.postAuthor = authors;
				this.dropdownOptions.author = authors;
				this.dropdownOptions.authorId = authors;
				
				console.log(`✅ Loaded ${authors.length} authors`);
			} else {
				console.log('ℹ️ No authors found or unexpected response structure');
				this.dropdownOptions.postAuthor = [];
				this.dropdownOptions.author = [];
				this.dropdownOptions.authorId = [];
			}
		} catch (error) {
			console.error('❌ Failed to load authors:', error);
			this.dropdownOptions.postAuthor = [];
			this.dropdownOptions.author = [];
			this.dropdownOptions.authorId = [];
		}
	}

	private async loadCategories() {
		try {
			const categoriesQuery = `
				query GetCategories {
					categories(limit: 50) {
						id
						title
						slug
					}
				}
			`;

			const response = await requestUrl({
				url: this.plugin.settings.endpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.plugin.settings.token}`
				},
				body: JSON.stringify({
					query: categoriesQuery
				})
			});
			
			if (response.json?.data?.categories) {
				const categories = response.json.data.categories.map((category: any) => ({
					value: category.id,
					label: category.title
				}));

				this.dropdownOptions.category = categories;
				this.dropdownOptions.categories = categories;
				this.dropdownOptions.categoryId = categories;
				
				console.log(`✅ Loaded ${categories.length} categories`);
			} else {
				console.log('ℹ️ No categories found or unexpected response structure');
				this.dropdownOptions.category = [];
				this.dropdownOptions.categories = [];
				this.dropdownOptions.categoryId = [];
			}
		} catch (error) {
			console.error('❌ Failed to load categories:', error);
			await this.loadCategoriesAlt();
		}
	}

	private async loadAssets() {
		try {
			const assetsQuery = `
				query GetAssets {
					assets(kind: "image", limit: 100) {
						id
						title
						filename
						url
						width
						height
					}
				}
			`;

			const response = await requestUrl({
				url: this.plugin.settings.endpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.plugin.settings.token}`
				},
				body: JSON.stringify({
					query: assetsQuery
				})
			});
			
			if (response.json?.data?.assets) {
				const assets = response.json.data.assets.map((asset: any) => ({
					value: asset.id,
					label: asset.title || asset.filename,
					filename: asset.filename,
					url: asset.url,
					width: asset.width,
					height: asset.height
				}));

				// Set up asset dropdown options for image-related fields
				this.dropdownOptions.image = assets;
				this.dropdownOptions.featuredImage = assets;
				this.dropdownOptions.sidebarAd = assets;
				this.dropdownOptions.topAd = assets;
				
				console.log(`✅ Loaded ${assets.length} image assets`);
			} else {
				console.log('ℹ️ No assets found or unexpected response structure');
				this.dropdownOptions.image = [];
				this.dropdownOptions.featuredImage = [];
				this.dropdownOptions.sidebarAd = [];
				this.dropdownOptions.topAd = [];
			}
		} catch (error) {
			console.error('❌ Failed to load assets:', error);
			this.dropdownOptions.image = [];
			this.dropdownOptions.featuredImage = [];
			this.dropdownOptions.sidebarAd = [];
			this.dropdownOptions.topAd = [];
		}
	}

	private async loadCategoriesAlt() {
		try {
			const altCategoriesQuery = `
				query GetCategoriesAlt {
					entries(section: "categories", limit: 50) {
						id
						title
						... on categories_Category {
							slug
						}
					}
				}
			`;

			const response = await requestUrl({
				url: this.plugin.settings.endpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.plugin.settings.token}`
				},
				body: JSON.stringify({
					query: altCategoriesQuery
				})
			});
			
			if (response.json?.data?.entries) {
				const categories = response.json.data.entries.map((category: any) => ({
					value: category.id,
					label: category.title
				}));

				this.dropdownOptions.category = categories;
				this.dropdownOptions.categories = categories;
				this.dropdownOptions.categoryId = categories;
				
				console.log(`✅ Loaded ${categories.length} categories (alternative method)`);
			} else {
				console.log('ℹ️ No categories found via alternative method either');
				this.dropdownOptions.category = [];
				this.dropdownOptions.categories = [];
				this.dropdownOptions.categoryId = [];
			}
		} catch (error) {
			console.error('❌ Alternative categories query also failed:', error);
			this.dropdownOptions.category = [];
			this.dropdownOptions.categories = [];
			this.dropdownOptions.categoryId = [];
		}
	}

private async prefillFromFrontmatter() {
		if (!this.currentFile) return;

		try {
			const content = await this.app.vault.read(this.currentFile);
			const { frontmatter, body } = parseFrontmatter(content);

			// Clean, non-redundant form data
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
				
				// Use the canonical field names (no duplicates)
				postAuthor: frontmatter.postAuthor || frontmatter.author || '',
				category: frontmatter.category || frontmatter.categoryId || '',
				image: frontmatter.image || frontmatter.featuredImage || '',
				
				// Include any other frontmatter fields that aren't duplicates
				...this.getOtherFrontmatterFields(frontmatter)
			};

		} catch (error) {
			console.error('⚠️ Failed to parse frontmatter:', error);
		}
	}

	// Helper to get other frontmatter fields while avoiding duplicates
	private getOtherFrontmatterFields(frontmatter: any): Record<string, any> {
		const handledFields = [
			'title', 'body', 'slug', 'deck', 'shortDeck', 'metaHeadline', 'metaDescription',
			'postDate', 'date', 'enabled', 'tags', 'description',
			// Author variations - only keep postAuthor
			'postAuthor', 'author', 'authorId',
			// Category variations - only keep category  
			'category', 'categories', 'categoryId',
			// Image variations - only keep image
			'image', 'featuredImage',
			// Craft internal fields
			'craftPostId', 'craftUrl'
		];

		const otherFields: Record<string, any> = {};
		Object.entries(frontmatter).forEach(([key, value]) => {
			if (!handledFields.includes(key) && value !== undefined && value !== '') {
				otherFields[key] = value;
			}
		});

		return otherFields;
	}

	private organizeFieldsByTabs() {
		const assignedFields = new Set();
		Object.values(this.tabs).forEach(tab => {
			if (tab.fields) {
				tab.fields.forEach(field => assignedFields.add(field));
			}
		});

		this.tabs.advanced.fields = this.formFields
			.filter(field => !assignedFields.has(field.name))
			.map(field => field.name);
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		this.renderHeader(contentEl);

		const mainContent = contentEl.createDiv('tabbed-main-content');
		this.renderTabNavigation(mainContent);
		this.renderTabContent(mainContent);
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
			if (fieldsInTab.length === 0 && tabKey !== 'article') return;
			
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

		const fieldsGrid = tabContent.createDiv('fields-grid');
		
		fieldsInTab.forEach(field => {
			this.renderFormField(fieldsGrid, field);
		});

		if (this.activeTab === 'article') {
			this.renderUploadOptionsInTab(tabContent);
		}
	}

	private renderAssetPicker(container: HTMLElement, field: FormFieldDefinition) {
		const assetContainer = container.createDiv('asset-picker-container');
		
		// Current selection display
		const currentSelection = assetContainer.createDiv('current-asset-selection');
		
		// Asset picker button
		const pickerBtn = assetContainer.createEl('button', {
			text: '🖼️ Choose Image',
			cls: 'asset-picker-btn'
		});
		
		pickerBtn.addEventListener('click', () => {
			this.openAssetModal(field);
		});
		
		// Upload new button
		const uploadBtn = assetContainer.createEl('button', {
			text: '📤 Upload New',
			cls: 'asset-upload-btn'
		});
		
		uploadBtn.addEventListener('click', () => {
			this.openImageUploadForAsset(field);
		});
		
		// Update display if there's a current value
		this.updateAssetDisplay(currentSelection, field);
	}

	private updateAssetDisplay(container: HTMLElement, field: FormFieldDefinition) {
		container.empty();
		
		const currentValue = this.formData[field.name];
		if (currentValue && this.dropdownOptions[field.name]) {
			const selectedAsset = this.dropdownOptions[field.name].find(asset => asset.value === currentValue);
			if (selectedAsset && selectedAsset.url) {
				container.innerHTML = `
					<div class="selected-asset">
						<img src="${selectedAsset.url}" alt="${selectedAsset.label}" class="asset-thumbnail" />
						<div class="asset-info">
							<div class="asset-name">${selectedAsset.label}</div>
							<div class="asset-filename">${selectedAsset.filename || 'Unknown filename'}</div>
						</div>
						<button class="remove-asset-btn" type="button">×</button>
					</div>
				`;
				
				const removeBtn = container.querySelector('.remove-asset-btn') as HTMLButtonElement;
				removeBtn?.addEventListener('click', () => {
					this.formData[field.name] = '';
					this.updateAssetDisplay(container, field);
				});
			}
		} else {
			container.innerHTML = `
				<div class="no-asset-selected">
					<div class="no-asset-icon">🖼️</div>
					<div class="no-asset-text">No ${field.label.toLowerCase()} selected</div>
				</div>
			`;
		}
	}

	private openAssetModal(field: FormFieldDefinition) {
		// Create a simple asset selection modal
		const modal = new Modal(this.app);
		modal.titleEl.setText(`Select ${field.label}`);
		
		const { contentEl } = modal;
		contentEl.addClass('asset-selection-modal');
		
		// Search input
		const searchInput = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Search images...',
			cls: 'asset-search-input'
		});
		
		// Assets grid
		const assetsGrid = contentEl.createDiv('assets-grid');
		
		const renderAssets = (searchTerm = '') => {
			assetsGrid.empty();
			
			const filteredAssets = this.dropdownOptions[field.name].filter((asset: any) => 
				asset.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
				asset.filename.toLowerCase().includes(searchTerm.toLowerCase())
			);
			
			filteredAssets.forEach((asset: any) => {
				const assetCard = assetsGrid.createDiv('asset-card');
				assetCard.innerHTML = `
					<img src="${asset.url}" alt="${asset.label}" class="asset-card-image" />
					<div class="asset-card-info">
						<div class="asset-card-title">${asset.label}</div>
						<div class="asset-card-filename">${asset.filename}</div>
					</div>
				`;
				
				assetCard.addEventListener('click', () => {
					this.formData[field.name] = asset.value;
					console.log(`📷 Selected asset for ${field.name}:`, asset.label);
					
					// Update the display in the main form
					const currentSelection = document.querySelector('.current-asset-selection') as HTMLElement;
					if (currentSelection) {
						this.updateAssetDisplay(currentSelection, field);
					}
					
					modal.close();
				});
			});
		};
		
		// Search functionality
		searchInput.addEventListener('input', () => {
			renderAssets(searchInput.value);
		});
		
		// Initial render
		renderAssets();
		
		modal.open();
	}

	private openImageUploadForAsset(field: FormFieldDefinition) {
		// Import and use existing image upload modal
		import('./imageModal').then(({ ImageUploadModal }) => {
			const editor = {
				replaceSelection: (assetCode: string) => {
					// Instead of inserting into editor, we'll handle the uploaded asset
					console.log('🖼️ Asset uploaded:', assetCode);
					
					// Extract asset ID from the asset code (format: {asset:ID:img})
					const match = assetCode.match(/\{asset:(\d+):img\}/);
					if (match) {
						const assetId = match[1];
						this.formData[field.name] = assetId;
						
						// Refresh the assets list to include the new upload
						this.loadAssets().then(() => {
							// Update the display
							const currentSelection = document.querySelector('.current-asset-selection') as HTMLElement;
							if (currentSelection) {
								this.updateAssetDisplay(currentSelection, field);
							}
						});
					}
				}
			} as any;
			
			new ImageUploadModal(this.app, this.plugin, editor).open();
		});
	}

	private getFieldsForTab(tabKey: string): FormFieldDefinition[] {
		const tab = this.tabs[tabKey];
		if (!tab) return [];
		
		const tabFieldNames = tab.fields;
		return this.formFields.filter(field => tabFieldNames.includes(field.name));
	}

	private renderFormField(container: HTMLElement, field: FormFieldDefinition) {
		const fieldContainer = container.createDiv('tab-form-field');
		
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

		// Check if this field should have an asset picker instead of dropdown/input
		const isAssetField = ['image', 'featuredImage', 'sidebarAd', 'topAd'].includes(field.name);
		
		if (isAssetField && this.dropdownOptions[field.name] && this.dropdownOptions[field.name].length > 0) {
			// Render asset picker interface
			this.renderAssetPicker(fieldContainer, field);
			return;
		}

		let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
		const inputContainer = fieldContainer.createDiv('field-input-container');

		const hasDropdownOptions = this.dropdownOptions[field.name] && 
									this.dropdownOptions[field.name].length > 0;

		if (hasDropdownOptions) {
			input = inputContainer.createEl('select', { cls: 'field-input' });
			const selectInput = input as HTMLSelectElement;
			
			const emptyOption = selectInput.createEl('option');
			emptyOption.value = '';
			emptyOption.textContent = `Select ${field.label}...`;
			
			this.dropdownOptions[field.name].forEach(option => {
				const opt = selectInput.createEl('option');
				opt.value = option.value;
				opt.textContent = option.label;
			});

			console.log(`🎯 Created dropdown for ${field.name} with ${this.dropdownOptions[field.name].length} options`);
		} else {
			switch (field.type) {
				case 'textarea':
					input = inputContainer.createEl('textarea', { cls: 'field-input' });
					(input as HTMLTextAreaElement).rows = field.name === 'body' ? 8 : 4;
					break;
				case 'checkbox':
					const checkboxContainer = inputContainer.createDiv('checkbox-container');
					input = checkboxContainer.createEl('input', { type: 'checkbox', cls: 'field-checkbox' });
					const label = checkboxContainer.createSpan({ text: 'Enable', cls: 'checkbox-label' });
					// Ensure the label comes after the input in DOM order
					checkboxContainer.appendChild(input);
					checkboxContainer.appendChild(label);
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
		}

		if (field.placeholder && !hasDropdownOptions && 
			(field.type !== 'select' && field.type !== 'checkbox')) {
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

		input.addEventListener('change', () => {
			if (field.type === 'checkbox') {
				this.formData[field.name] = (input as HTMLInputElement).checked;
			} else {
				this.formData[field.name] = input.value;
			}
			console.log(`📝 Updated ${field.name}:`, this.formData[field.name]);
		});
	}

	private renderUploadOptionsInTab(container: HTMLElement) {
		const optionsSection = container.createDiv('upload-options-section');
		optionsSection.createEl('h3', { text: '⚙️ Upload Options' });

		const optionsGrid = optionsSection.createDiv('options-grid');
		
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

		this.showDropdownStatus(optionsGrid);
		this.showValidationStatus(optionsGrid);
	}

	private showDropdownStatus(container: HTMLElement) {
		const statusCard = container.createDiv('status-card dropdown-status');
		
		const authorCount = this.dropdownOptions.postAuthor?.length || 0;
		const categoryCount = this.dropdownOptions.category?.length || 0;
		const assetCount = this.dropdownOptions.image?.length || 0;
		
		statusCard.innerHTML = `
			<div class="status-header">
				<span class="status-icon">📊</span>
				<span class="status-title">Dropdown Data</span>
			</div>
			<div class="status-description">
				${authorCount} authors, ${categoryCount} categories, ${assetCount} assets loaded
			</div>
		`;

		if (authorCount === 0 && categoryCount === 0 && assetCount === 0) {
			statusCard.addClass('status-warning');
		} else {
			statusCard.addClass('status-success');
		}
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
		
		const updateBtn = footerRight.createEl('button', {
			text: '💾 Update Metadata',
			cls: 'footer-update-btn'
		});
		
		updateBtn.addEventListener('click', async () => {
			await this.handleMetadataUpdate();
		});
		
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

private async handleMetadataUpdate() {
		if (!this.currentFile) {
			new Notice('No file selected');
			return;
		}

		try {
			new Notice('💾 Updating metadata...');

			// Read current file content
			const currentContent = await this.app.vault.read(this.currentFile);
			const { frontmatter: existingFrontmatter, body } = parseFrontmatter(currentContent);

			// Prepare clean, canonical metadata
			const updatedMetadata: Record<string, any> = {
				...existingFrontmatter, // Keep existing frontmatter as base
				
				// Core content fields
				title: this.formData.title || this.currentFile.basename,
				slug: this.formData.slug,
				deck: this.formData.deck,
				shortDeck: this.formData.shortDeck,
				metaHeadline: this.formData.metaHeadline,
				metaDescription: this.formData.metaDescription,
				postDate: this.formData.postDate,
				enabled: this.formData.enabled,
				
				// Use canonical field names only
				postAuthor: this.formData.postAuthor || undefined,
				category: this.formData.category || undefined,
				image: this.formData.image || undefined,
			};

			// Handle tags - could be string or array
			if (this.formData.tags) {
				if (typeof this.formData.tags === 'string') {
					updatedMetadata.tags = this.formData.tags.split(',').map((t: string) => t.trim()).filter(t => t.length > 0);
				} else if (Array.isArray(this.formData.tags)) {
					updatedMetadata.tags = this.formData.tags;
				}
			}

			// Add any other custom fields from the form (but avoid duplicates)
			const duplicateFields = ['author', 'authorId', 'categories', 'categoryId', 'featuredImage'];
			Object.entries(this.formData).forEach(([key, value]) => {
				if (!['title', 'body', 'slug', 'deck', 'shortDeck', 'metaHeadline', 
					  'metaDescription', 'postDate', 'enabled', 'tags', 'postAuthor', 
					  'category', 'image'].includes(key) && 
					!duplicateFields.includes(key)) {
					if (value !== undefined && value !== '') {
						updatedMetadata[key] = value;
					}
				}
			});

			// Clean up the metadata - remove duplicate/redundant fields
			const fieldsToRemove = ['author', 'authorId', 'categories', 'categoryId', 'featuredImage'];
			fieldsToRemove.forEach(field => {
				delete updatedMetadata[field];
			});

			// Remove undefined values to keep frontmatter clean
			Object.keys(updatedMetadata).forEach(key => {
				if (updatedMetadata[key] === undefined || updatedMetadata[key] === '') {
					delete updatedMetadata[key];
				}
			});

			// Convert back to frontmatter format
			const updatedContent = updateFrontmatter(currentContent, updatedMetadata);

			// Write back to file
			await this.app.vault.modify(this.currentFile, updatedContent);

			new Notice('✅ Metadata updated (duplicates cleaned)!');
			console.log('📝 Clean updated frontmatter:', updatedMetadata);

			// Refresh the form data to show the clean version
			await this.prefillFromFrontmatter();

		} catch (error) {
			console.error('💥 Metadata update failed:', error);
			new Notice(`Metadata update failed: ${error.message}`);
		}
	}

	private async handleUpload() {
		if (!this.selectedContentType || !this.currentFile) {
			new Notice('Missing required data for upload');
			return;
		}

		try {
			new Notice('🚀 Starting smart upload...');

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

			console.log('📤 Smart upload data with dropdowns:', postData);

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
					max-width: 1200px !important;
					width: 1200px !important;
					min-height: 800px !important;
				}
					
				.modal.mod-tabbed-upload .modal-content * {
					font-size: 16px !important;
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
					margin: 0 0 2px 0;
				}

				.header-left p {
					margin: 0;
					opacity: 0.9;
					font-weight: 400;
				}

				.content-type-select {
					background: rgba(255, 255, 255, 0.2);
					border: 1px solid rgba(255, 255, 255, 0.3);
					color: white;
					padding: 8px 12px;
					border-radius: 4px;
					min-width: 200px;
					max-width: 300px;
					font-weight: 400;
					min-height: 40px;
				}

				.content-type-select option {
					background: var(--background-primary);
					color: var(--text-normal);
				}

				/* Main content */
				.tabbed-main-content {
					display: flex;
					height: 700px;
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
					padding: 12px 16px;
					cursor: pointer;
					display: flex;
					align-items: center;
					gap: 12px;
					transition: all 0.2s ease;
					border-left: 3px solid transparent;
					font-weight: 400;
					min-height: 48px;
				}

				.tab-button:hover {
					background: var(--background-modifier-hover);
				}

				.tab-button.active {
					background: var(--background-modifier-hover);
					border-left-color: var(--interactive-accent);
					color: var(--interactive-accent);
				}

				.tab-icon {
					flex-shrink: 0;
				}

				.tab-name {
					font-weight: 500;
					flex: 1;
				}

				.tab-count {
					background: var(--text-muted);
					color: var(--background-primary);
					padding: 2px 6px;
					border-radius: 6px;
					font-weight: 600;
					min-width: 20px;
					text-align: center;
					flex-shrink: 0;
					line-height: 1.2;
				}

				.tab-button.active .tab-count {
					background: var(--interactive-accent);
					color: white;
				}

				/* Tab content */
				.tab-content {
					flex: 1;
					padding: 20px;
					overflow-y: auto;
					background: var(--background-primary);
				}

				.empty-tab {
					text-align: center;
					padding: 40px 20px;
					color: var(--text-muted);
				}

				.empty-tab-icon {
					margin-bottom: 12px;
					opacity: 0.6;
				}

				.empty-tab h3 {
					margin: 0 0 6px 0;
				}

				.empty-tab p {
					margin: 0;
					opacity: 0.8;
				}

				/* Fields grid */
				.fields-grid {
					display: grid;
					gap: 20px;
					max-width: 100%;
				}

				.tab-form-field {
					border: 1px solid var(--background-modifier-border);
					border-radius: 8px;
					padding: 16px;
					background: var(--background-primary);
					box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
					transition: all 0.2s ease;
				}

				.tab-form-field:hover {
					border-color: var(--interactive-accent);
					box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
				}

				.field-header {
					margin-bottom: 8px;
				}

				.field-label {
					display: block;
					margin-bottom: 6px;
				}

				.field-name {
					font-weight: 600;
					color: var(--text-normal);
				}

				.required-indicator {
					color: var(--text-error);
					margin-left: 2px;
					font-weight: bold;
				}

				.field-description {
					color: var(--text-muted);
					margin-top: 4px;
					line-height: 1.4;
					font-weight: 400;
					opacity: 0.8;
				}

				.field-input {
					width: 100%;
					padding: 12px 16px;
					border: 2px solid var(--background-modifier-border);
					border-radius: 4px;
					min-height: 44px;
					font-weight: 400;
					background: var(--background-primary);
					color: var(--text-normal);
					transition: all 0.2s ease;
					font-family: var(--font-interface);
				}

				.field-input:focus {
					outline: none;
					border-color: var(--interactive-accent);
					box-shadow: 0 0 0 2px var(--interactive-accent-hover);
					background: var(--background-primary);
				}

				.field-input::placeholder {
					color: var(--text-faint);
					opacity: 0.8;
				}

				.checkbox-container {
					display: flex;
					align-items: center;
					justify-content: flex-start;
					gap: 20px;
					min-height: 44px;
					padding: 8px 0;
					position: relative;
				}

				.field-checkbox {
					width: auto !important;
					min-height: auto !important;
					margin: 0 !important;
					flex-shrink: 0;
					position: relative;
					z-index: 1;
				}

				.checkbox-label {
					font-weight: 500;
					line-height: 1.4;
					flex: 1;
					position: relative;
					z-index: 1;
					pointer-events: none;
				}

				/* Asset Picker Styles */
				.asset-picker-container {
					display: flex;
					flex-direction: column;
					gap: 12px;
				}

				.current-asset-selection {
					min-height: 80px;
					border: 2px dashed var(--background-modifier-border);
					border-radius: 6px;
					padding: 12px;
					display: flex;
					align-items: center;
					justify-content: center;
				}

				.selected-asset {
					display: flex;
					align-items: center;
					gap: 12px;
					width: 100%;
				}

				.asset-thumbnail {
					width: 60px;
					height: 60px;
					object-fit: cover;
					border-radius: 4px;
					border: 1px solid var(--background-modifier-border);
				}

				.asset-info {
					flex: 1;
				}

				.asset-name {
					font-weight: 500;
					margin-bottom: 2px;
				}

				.asset-filename {
					color: var(--text-muted);
					opacity: 0.8;
				}

				.remove-asset-btn {
					background: var(--background-modifier-error);
					color: var(--text-error);
					border: none;
					width: 24px;
					height: 24px;
					border-radius: 50%;
					cursor: pointer;
					font-weight: bold;
				}

				.no-asset-selected {
					display: flex;
					flex-direction: column;
					align-items: center;
					gap: 8px;
					color: var(--text-muted);
					opacity: 0.7;
				}

				.no-asset-icon {
					opacity: 0.5;
				}

				.asset-picker-btn,
				.asset-upload-btn {
					display: flex;
					align-items: center;
					justify-content: center;
					gap: 8px;
					padding: 10px 16px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-primary);
					color: var(--text-normal);
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.asset-picker-btn:hover,
				.asset-upload-btn:hover {
					border-color: var(--interactive-accent);
					background: var(--background-modifier-hover);
				}

				/* Asset Selection Modal */
				.asset-selection-modal {
					max-width: 800px;
					min-height: 600px;
				}

				.asset-search-input {
					width: 100%;
					padding: 12px;
					margin-bottom: 16px;
					border: 2px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-primary);
				}

				.assets-grid {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
					gap: 16px;
					max-height: 400px;
					overflow-y: auto;
				}

				.asset-card {
					border: 1px solid var(--background-modifier-border);
					border-radius: 6px;
					padding: 12px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.asset-card:hover {
					border-color: var(--interactive-accent);
					background: var(--background-modifier-hover);
				}

				.asset-card-image {
					width: 100%;
					height: 120px;
					object-fit: cover;
					border-radius: 4px;
					margin-bottom: 8px;
				}

				.asset-card-title {
					font-weight: 500;
					margin-bottom: 2px;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}

				.asset-card-filename {
					color: var(--text-muted);
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}

				/* Upload options */
				.upload-options-section {
					margin-top: 24px;
					padding-top: 20px;
					border-top: 1px solid var(--background-modifier-border);
				}

				.upload-options-section h3 {
					margin: 0 0 12px 0;
					color: var(--text-normal);
				}

				.options-grid {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
					gap: 12px;
				}

				.option-card,
				.status-card {
					border: 1px solid var(--background-modifier-border);
					border-radius: 6px;
					padding: 12px;
					position: relative;
					transition: all 0.2s ease;
				}

				.option-card:hover {
					border-color: var(--interactive-accent);
					background: var(--background-modifier-hover);
				}

				.option-header,
				.status-header {
					display: flex;
					align-items: center;
					gap: 6px;
					margin-bottom: 4px;
				}

				.option-title,
				.status-title {
					font-weight: 600;
				}

				.option-description,
				.status-description {
					font-weight: 400;
					color: var(--text-muted);
					line-height: 1.3;
					margin-right: 24px;
				}

				.option-checkbox {
					position: absolute;
					top: 10px;
					right: 10px;
					transform: scale(0.8);
					z-index: 10;
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

				.dropdown-status {
					border-color: var(--interactive-accent);
					background: rgba(102, 126, 234, 0.1);
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
					font-weight: 400;
					color: var(--text-muted);
				}

				.footer-right {
					display: flex;
					gap: 12px;
				}

				.footer-update-btn {
					background: linear-gradient(135deg, #059669 0%, #10b981 100%);
					color: white;
					border: none;
					padding: 12px 24px;
					border-radius: 6px;
					font-weight: 500;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.footer-update-btn:hover {
					transform: translateY(-1px);
					box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
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