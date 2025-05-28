import { App, Editor, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { CraftAPI } from './src/api/craftAPI';
import { CraftCMSSettings, PostData, UploadOptions } from './src/api/types';
import { DEFAULT_SETTINGS, validateSettings, extractBaseUrl } from './src/settings/settings';
import { CraftCMSSettingTab } from './src/settings/settingsTab';
import { UploadModal } from './src/ui/uploadModal';
import { DynamicUploadModal } from './src/ui/dynamicUploadModal';
import { TabbedUploadModal } from './src/ui/tabbedUploadModal';
import { ImageUploadModal } from './src/ui/imageModal';
import { SchemaAnalysisModal } from './src/ui/schemaModal';
import { SchemaManager } from './src/api/schemaManager';
import { parseFrontmatter, addToFrontmatter } from './src/utils/frontmatter';
import { slugify } from './src/utils/textUtils';

export default class CraftCMSPlugin extends Plugin {
	settings: CraftCMSSettings;
	api: CraftAPI;
	schemaManager: SchemaManager;

	async onload() {
		console.log('🚀 Craft CMS Plugin: Starting to load...');
		await this.loadSettings();
		
		// Initialize API client and schema manager
		this.api = new CraftAPI(this.settings);
		this.schemaManager = new SchemaManager(this.api);

		// Register ribbon icon
		const ribbonIconEl = this.addRibbonIcon('upload', 'Upload to Craft CMS', (evt: MouseEvent) => {
			this.uploadCurrentPost();
		});
		ribbonIconEl.addClass('craft-cms-ribbon-class');

		// Register commands
		this.registerCommands();

		// Add settings tab
		this.addSettingTab(new CraftCMSSettingTab(this.app, this));
		
		console.log('✅ Craft CMS Plugin: Fully loaded!');
	}

	private registerCommands() {
		this.addCommand({
			id: 'upload-current-post',
			name: 'Upload current post to Craft CMS',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.uploadCurrentPost();
			}
		});

		this.addCommand({
			id: 'upload-post-dialog',
			name: 'Upload post to Craft CMS (with options)',
			callback: () => {
				new UploadModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'upload-post-force-new',
			name: 'Upload as NEW post (ignore existing ID)',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.uploadCurrentPost({ forceNew: true });
			}
		});

		this.addCommand({
			id: 'open-craft-url',
			name: 'Open post in Craft CMS',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.openInCraft();
			}
		});

		this.addCommand({
			id: 'upload-image',
			name: 'Upload image to Craft CMS',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new ImageUploadModal(this.app, this, editor).open();
			}
		});

		this.addCommand({
			id: 'test-craft-connection',
			name: 'Test Craft CMS connection',
			callback: () => {
				this.testConnection();
			}
		});

		this.addCommand({
			id: 'analyze-craft-schema',
			name: 'Analyze Craft CMS Schema',
			callback: () => {
				new SchemaAnalysisModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'smart-upload-with-schema',
			name: 'Smart Upload (Schema-based)',
			callback: () => {
				this.smartUpload();
			}
		});

		this.addCommand({
			id: 'dynamic-upload',
			name: 'Dynamic Upload (Smart Form)',
			callback: () => {
				new DynamicUploadModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'tabbed-upload',
			name: 'Tabbed Upload (Smart Form)',
			callback: () => {
				new TabbedUploadModal(this.app, this).open();
			}
		});
	}

	async openInCraft() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.file) {
			new Notice('No active file found');
			return;
		}

		const content = await this.app.vault.read(activeView.file);
		const { frontmatter } = parseFrontmatter(content);

		if (frontmatter.craftPostId) {
			const baseUrl = this.settings.baseUrl || extractBaseUrl(this.settings.endpoint);
			const slug = frontmatter.slug || 'post';
			const editUrl = `${baseUrl}/admin/entries/posts/${frontmatter.craftPostId}-${slug}?site=default`;
			console.log('🔗 Opening Craft CMS edit URL:', editUrl);
			window.open(editUrl, '_blank');
		} else if (frontmatter.craftUrl) {
			console.log('🔗 Opening public URL:', frontmatter.craftUrl);
			window.open(frontmatter.craftUrl, '_blank');
		} else {
			new Notice('No Craft CMS URL found in frontmatter');
		}
	}

	async testConnection() {
		if (!this.settings.token) {
			new Notice('Please configure your API token first');
			return;
		}

		try {
			new Notice('Testing connection...');
			const isConnected = await this.api.testConnection();
			
			if (isConnected) {
				new Notice('✅ Connection successful!');
			} else {
				new Notice('❌ Connection failed');
			}
		} catch (error) {
			console.error('Connection test error:', error);
			new Notice(`Connection test failed: ${error.message}`);
		}
	}

	async uploadCurrentPost(options?: UploadOptions) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice('No active markdown file found');
			return;
		}

		const file = activeView.file;
		if (!file) {
			new Notice('No file selected');
			return;
		}

		try {
			await this.uploadPost(file, options);
		} catch (error) {
			console.error('Upload failed:', error);
			new Notice(`Upload failed: ${error.message}`);
		}
	}

	async uploadPost(file: TFile, options?: UploadOptions) {
		// Validate settings
		const validationErrors = validateSettings(this.settings);
		if (validationErrors.length > 0) {
			new Notice(`Settings validation failed: ${validationErrors.join(', ')}`);
			return;
		}

		new Notice('Starting upload...');

		const content = await this.app.vault.read(file);
		const { frontmatter, body } = parseFrontmatter(content);

		console.log('📊 Parsed frontmatter:', frontmatter);

		// Get available content types to determine what fields are supported
		let supportedFields: string[] = [];
		try {
			const contentTypes = await this.schemaManager.getContentTypesForSection(this.settings.sectionHandle);
			if (contentTypes.length > 0) {
				const formFields = await this.schemaManager.getFormFields(contentTypes[0].handle);
				supportedFields = formFields.map(field => field.name);
				console.log('🔍 Supported fields from schema:', supportedFields);
			}
		} catch (error) {
			console.warn('⚠️ Could not load schema fields, using basic field set:', error);
		}

		// Prepare core post data with all known fields
		const corePostData: PostData = {
			title: frontmatter.title || file.basename,
			body: body,
			deck: frontmatter.deck,
			shortDeck: frontmatter.shortDeck || frontmatter.description,
			slug: frontmatter.slug || slugify(frontmatter.title || file.basename),
			metaHeadline: frontmatter.metaHeadline || frontmatter.title,
			metaDescription: frontmatter.metaDescription || frontmatter.description,
			tags: frontmatter.tags || [],
			enabled: options?.asDraft ? false : (frontmatter.enabled ?? true),
			postDate: frontmatter.postDate || frontmatter.date || new Date().toISOString(),
			featuredImage: frontmatter.featuredImage || frontmatter.image,
			sidebarAdToggle: frontmatter.sidebarAdToggle ?? true,
			topBarAdToggle: frontmatter.topBarAdToggle ?? true,
			bottomAdToggle: frontmatter.bottomAdToggle ?? true,
			optimizeAds: frontmatter.optimizeAds ?? true
		};

		// Add dynamic fields from frontmatter that exist in the schema
		const dynamicFields: Record<string, any> = {};
		
		// Core fields that are already handled above
		const coreFieldNames = [
			'title', 'body', 'deck', 'shortDeck', 'slug', 'metaHeadline', 'metaDescription',
			'tags', 'enabled', 'postDate', 'featuredImage', 'image', 'sidebarAdToggle', 
			'topBarAdToggle', 'bottomAdToggle', 'optimizeAds', 
			// Skip internal craft fields
			'craftPostId', 'craftUrl'
		];

		// Add any frontmatter fields that aren't in the core set
		Object.entries(frontmatter).forEach(([key, value]) => {
			if (!coreFieldNames.includes(key) && value !== undefined && value !== '') {
				// If we have schema info, only include fields that are supported
				if (supportedFields.length === 0 || supportedFields.includes(key)) {
					dynamicFields[key] = value;
					console.log(`✅ Adding dynamic field: ${key} = ${value}`);
				} else {
					console.log(`⏭️ Skipping unsupported field: ${key} = ${value}`);
				}
			}
		});

		// Combine core and dynamic data
		const postData: PostData = {
			...corePostData,
			...dynamicFields,
			// Always set the author field to your ID (required for publishing)
			author: this.settings.authorId, // This ensures you're always the backend author
		};

		console.log('📤 Final post data with dynamic fields:', postData);

		// Handle tags with creation - UPDATED TO USE NEW METHOD
		console.log('🏷️ Processing tags:', postData.tags);
		const tagIds = await this.api.findOrCreateTags(postData.tags || []);
		console.log('🏷️ Final tag IDs:', tagIds);
		
		const existingPostId = frontmatter.craftPostId;
		const shouldUpdate = existingPostId && !options?.forceNew;

		let result;
		if (shouldUpdate) {
			console.log('🔄 Updating existing post with ID:', existingPostId);
			result = await this.api.updatePost(existingPostId, postData, tagIds, supportedFields);
		} else {
			console.log('🚀 Creating new post...');
			result = await this.api.createPost(postData, tagIds, supportedFields);
			
			// Save post ID and URL to frontmatter if auto-save is enabled
			if (result?.id && this.settings.autoSavePostId) {
				await this.saveCraftDataToFrontmatter(file, {
					craftPostId: result.id,
					craftUrl: result.url
				});
			}
		}

		console.log('✅ Post processed successfully:', result);
		new Notice(`✅ Post uploaded successfully with ${tagIds.length} tags!`);
	}

	private async saveCraftDataToFrontmatter(file: TFile, craftData: { craftPostId: string; craftUrl: string }) {
		const content = await this.app.vault.read(file);
		const updatedContent = addToFrontmatter(content, craftData);
		await this.app.vault.modify(file, updatedContent);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		
		// Update API client and schema manager when settings change
		if (this.api) {
			this.api = new CraftAPI(this.settings);
			this.schemaManager = new SchemaManager(this.api);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Update API client and schema manager with new settings
		this.api = new CraftAPI(this.settings);
		this.schemaManager = new SchemaManager(this.api);
	}

	/**
	 * Smart upload that uses schema analysis to determine optimal upload strategy
	 */
	private async smartUpload() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.file) {
			new Notice('No active file found');
			return;
		}

		try {
			new Notice('🧠 Analyzing content for smart upload...');

			// Get available content types for the current section
			const contentTypes = await this.schemaManager.getContentTypesForSection(this.settings.sectionHandle);
			
			if (contentTypes.length === 0) {
				new Notice('No content types found for this section. Using standard upload.');
				await this.uploadCurrentPost();
				return;
			}

			// For now, use the first content type. In the future, this could be smarter
			const contentType = contentTypes[0];
			
			// Validate the content type supports our upload
			const validation = await this.schemaManager.validateContentTypeForUpload(contentType.handle);
			
			if (!validation.valid) {
				new Notice(`Content type validation failed: ${validation.errors.join(', ')}`);
				return;
			}

			if (validation.warnings && validation.warnings.length > 0) {
				console.warn('⚠️ Upload warnings:', validation.warnings);
			}

			// Get form fields for this content type
			const formFields = await this.schemaManager.getFormFields(contentType.handle);
			console.log('📋 Available fields for smart upload:', formFields);

			new Notice(`✅ Smart upload ready! Using ${contentType.name} with ${formFields.length} fields`);
			
			// For now, fall back to regular upload. Future enhancement: dynamic form
			await this.uploadCurrentPost();

		} catch (error) {
			console.error('💥 Smart upload failed:', error);
			new Notice(`Smart upload failed: ${error.message}. Using standard upload.`);
			await this.uploadCurrentPost();
		}
	}
}