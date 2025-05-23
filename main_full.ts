import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from 'obsidian';
import { parseYaml } from 'obsidian';

interface CraftCMSSettings {
	endpoint: string;
	token: string;
	sectionHandle: string;
	authorId: string;
	autoSavePostId: boolean;
	baseUrl: string;
}

const DEFAULT_SETTINGS: CraftCMSSettings = {
	endpoint: 'https://old.tedium.co/index.php?action=graphql/api',
	token: '',
	sectionHandle: 'posts',
	authorId: '1',
	autoSavePostId: true,
	baseUrl: 'https://old.tedium.co'
}

interface PostData {
	title: string;
	body: string;
	deck?: string;
	shortDeck?: string;
	slug?: string;
	metaHeadline?: string;
	metaDescription?: string;
	tags?: string[];
	enabled?: boolean;
	postDate?: string;
	featuredImage?: string;
	sidebarAdToggle?: boolean;
	topBarAdToggle?: boolean;
	bottomAdToggle?: boolean;
	optimizeAds?: boolean;
}

export default class CraftCMSPlugin extends Plugin {
	settings: CraftCMSSettings;

	async onload() {
		console.log('🚀 Craft CMS Plugin: Starting to load...');
		await this.loadSettings();

		const ribbonIconEl = this.addRibbonIcon('upload', 'Upload to Craft CMS', (evt: MouseEvent) => {
			this.uploadCurrentPost();
		});
		ribbonIconEl.addClass('craft-cms-ribbon-class');

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

		this.addSettingTab(new CraftCMSSettingTab(this.app, this));
		console.log('✅ Craft CMS Plugin: Fully loaded!');
	}

	async openInCraft() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.file) {
			new Notice('No active file found');
			return;
		}

		const content = await this.app.vault.read(activeView.file);
		const { frontmatter } = this.parseFrontmatter(content);

		if (frontmatter.craftPostId) {
			const baseUrl = this.settings.baseUrl || this.extractBaseUrl(this.settings.endpoint);
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

	extractBaseUrl(endpoint: string): string {
		const url = new URL(endpoint);
		return `${url.protocol}//${url.host}`;
	}

	async uploadImageToCraft(imageData: ArrayBuffer, filename: string): Promise<{ id: string, url: string }> {
		console.log('🖼️ Uploading image to Craft CMS:', filename);
		
		const base64Data = this.arrayBufferToBase64(imageData);
		const mimeType = this.getMimeType(filename);
		const dataURL = `data:${mimeType};base64,${base64Data}`;

		const uploadMutation = `
			mutation UploadImage($file: FileInput!, $title: String) {
				save_images_Asset(
					_file: $file
					title: $title
				) {
					id
					url
					filename
					title
				}
			}
		`;

		try {
			const response = await requestUrl({
				url: this.settings.endpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.settings.token}`
				},
				body: JSON.stringify({
					query: uploadMutation,
					variables: {
						file: {
							fileData: dataURL, // Data URL format - this is what works!
							filename: filename
						},
						title: filename.replace(/\.[^/.]+$/, "")
					}
				})
			});

			console.log('📡 Upload response:', response.json);

			if (response.json?.errors) {
				console.error('💥 GraphQL errors:', response.json.errors);
				throw new Error(`Upload failed: ${response.json.errors.map((e: any) => e.message).join(', ')}`);
			}

			if (response.json?.data?.save_images_Asset) {
				const asset = response.json.data.save_images_Asset;
				console.log('✅ Image uploaded successfully:', asset);
				return { id: asset.id, url: asset.url };
			}

			throw new Error(`Unexpected response format: ${JSON.stringify(response.json)}`);

		} catch (error) {
			console.error('🔄 Image upload failed:', error);
			throw error;
		}
	}

	arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	getMimeType(filename: string): string {
		const ext = filename.toLowerCase().split('.').pop();
		const mimeTypes: { [key: string]: string } = {
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'png': 'image/png',
			'gif': 'image/gif',
			'webp': 'image/webp',
			'svg': 'image/svg+xml'
		};
		return mimeTypes[ext || ''] || 'image/jpeg';
	}

	async testConnection() {
		if (!this.settings.token) {
			new Notice('Please configure your API token first');
			return;
		}

		const testQuery = `
			query TestConnection {
				entries (section: "posts", limit: 1) {
					id
					title
				}
			}
		`;

		try {
			new Notice('Testing connection...');
			
			const response = await requestUrl({
				url: this.settings.endpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.settings.token}`
				},
				body: JSON.stringify({
					query: testQuery
				})
			});

			console.log('🧪 Test response:', response.json);

			if (response.status === 200 && response.json.data) {
				new Notice('✅ Connection successful!');
			} else {
				new Notice('❌ Connection failed');
			}

		} catch (error) {
			console.error('Connection test error:', error);
			new Notice(`Connection test failed: ${error.message}`);
		}
	}

	async uploadCurrentPost(options?: { asDraft?: boolean; forceNew?: boolean }) {
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

	async uploadPost(file: TFile, options?: { asDraft?: boolean; forceNew?: boolean }) {
		if (!this.settings.token) {
			new Notice('Please configure your Craft CMS token in settings');
			return;
		}

		new Notice('Starting upload...');

		const content = await this.app.vault.read(file);
		const { frontmatter, body } = this.parseFrontmatter(content);

		console.log('📊 Parsed frontmatter:', frontmatter);

		const postData: PostData = {
			title: frontmatter.title || file.basename,
			body: body,
			deck: frontmatter.deck,
			shortDeck: frontmatter.shortDeck || frontmatter.description,
			slug: frontmatter.slug || this.slugify(frontmatter.title || file.basename),
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

		console.log('📤 Final post data:', postData);

		const tagIds = await this.handleTags(postData.tags || []);
		const existingPostId = frontmatter.craftPostId;
		const shouldUpdate = existingPostId && !options?.forceNew;

		let result;
		if (shouldUpdate) {
			console.log('🔄 Updating existing post with ID:', existingPostId);
			result = await this.updatePost(existingPostId, postData, tagIds);
		} else {
			console.log('🚀 Creating new post...');
			result = await this.createPost(postData, tagIds);
			
			if (result?.id && this.settings.autoSavePostId) {
				await this.saveCraftDataToFrontmatter(file, {
					craftPostId: result.id,
					craftUrl: result.url
				});
			}
		}

		console.log('✅ Post processed successfully:', result);
		new Notice('✅ Post uploaded successfully!');
	}

	parseFrontmatter(content: string): { frontmatter: any, body: string } {
		const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
		const match = content.match(frontmatterRegex);

		if (match) {
			try {
				const yamlContent = match[1].trim();
				const frontmatter = parseYaml(yamlContent) || {};
				return { frontmatter, body: match[2].trim() };
			} catch (error) {
				console.error('❌ Error parsing frontmatter:', error);
				return { frontmatter: {}, body: match[2].trim() };
			}
		}

		return { frontmatter: {}, body: content };
	}

	async handleTags(tagNames: string[]): Promise<number[]> {
		if (!tagNames || tagNames.length === 0) {
			return [];
		}

		const tagIds: number[] = [];

		for (const tagName of tagNames) {
			try {
				const findTagQuery = `
					query FindTag($titles: [String]) {
						tags(title: $titles, limit: 1) {
							id
							title
						}
					}
				`;

				const findResponse = await requestUrl({
					url: this.settings.endpoint,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${this.settings.token}`
					},
					body: JSON.stringify({
						query: findTagQuery,
						variables: { titles: [tagName] }
					})
				});

				if (findResponse.json.data?.tags?.length > 0) {
					const existingTag = findResponse.json.data.tags[0];
					tagIds.push(parseInt(existingTag.id));
					console.log(`✅ Found existing tag: ${tagName} (ID: ${existingTag.id})`);
				} else {
					console.log(`⏭️ Tag not found: ${tagName}`);
				}
			} catch (error) {
				console.warn(`❌ Error processing tag ${tagName}:`, error);
			}
		}

		return tagIds;
	}

	async createPost(postData: PostData, tagIds: number[] = []) {
		const createPostMutation = `
			mutation CreatePost(
				$title: String!
				$body: String!
				$enabled: Boolean
				$deck: String
				$shortDeck: String
				$slug: String
				$postDate: DateTime
				$metaHeadline: String
				$metaDescription: String
				$tags: [Int]
			) {
				save_posts_posts_Entry(
					title: $title
					body: $body
					enabled: $enabled
					deck: $deck
					shortDeck: $shortDeck
					slug: $slug
					postDate: $postDate
					metaHeadline: $metaHeadline
					metaDescription: $metaDescription
					tags: $tags
				) {
					id
					title
					url
					slug
					deck
					shortDeck
					postDate
					tags {
						id
						title
					}
				}
			}
		`;

		const variables = {
			title: postData.title,
			body: postData.body,
			enabled: postData.enabled,
			deck: postData.deck,
			shortDeck: postData.shortDeck,
			slug: postData.slug,
			postDate: postData.postDate,
			metaHeadline: postData.metaHeadline,
			metaDescription: postData.metaDescription,
			tags: tagIds.length > 0 ? tagIds : undefined
		};

		const response = await requestUrl({
			url: this.settings.endpoint,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.token}`
			},
			body: JSON.stringify({
				query: createPostMutation,
				variables: variables
			})
		});

		if (response.json && response.json.errors) {
			throw new Error(`GraphQL Error: ${JSON.stringify(response.json.errors)}`);
		}

		if (response.json && response.json.data && response.json.data.save_posts_posts_Entry) {
			return response.json.data.save_posts_posts_Entry;
		}

		throw new Error(`Unexpected response format: ${JSON.stringify(response.json)}`);
	}

	async updatePost(postId: string, postData: PostData, tagIds: number[] = []) {
		const updatePostMutation = `
			mutation UpdatePost(
				$id: ID!
				$title: String!
				$body: String!
				$enabled: Boolean
				$deck: String
				$shortDeck: String
				$slug: String
				$postDate: DateTime
				$metaHeadline: String
				$metaDescription: String
				$tags: [Int]
			) {
				save_posts_posts_Entry(
					id: $id
					title: $title
					body: $body
					enabled: $enabled
					deck: $deck
					shortDeck: $shortDeck
					slug: $slug
					postDate: $postDate
					metaHeadline: $metaHeadline
					metaDescription: $metaDescription
					tags: $tags
				) {
					id
					title
					url
					slug
					deck
					shortDeck
					postDate
					tags {
						id
						title
					}
				}
			}
		`;

		const variables = {
			id: postId,
			title: postData.title,
			body: postData.body,
			enabled: postData.enabled,
			deck: postData.deck,
			shortDeck: postData.shortDeck,
			slug: postData.slug,
			postDate: postData.postDate,
			metaHeadline: postData.metaHeadline,
			metaDescription: postData.metaDescription,
			tags: tagIds.length > 0 ? tagIds : undefined
		};

		const response = await requestUrl({
			url: this.settings.endpoint,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.token}`
			},
			body: JSON.stringify({
				query: updatePostMutation,
				variables: variables
			})
		});

		if (response.json && response.json.errors) {
			throw new Error(`GraphQL Error: ${JSON.stringify(response.json.errors)}`);
		}

		if (response.json && response.json.data && response.json.data.save_posts_posts_Entry) {
			return response.json.data.save_posts_posts_Entry;
		}

		throw new Error(`Unexpected response format: ${JSON.stringify(response.json)}`);
	}

	async saveCraftDataToFrontmatter(file: TFile, craftData: { craftPostId: string; craftUrl: string }) {
		const content = await this.app.vault.read(file);
		const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
		const match = content.match(frontmatterRegex);

		if (match) {
			let yamlContent = match[1];
			const bodyContent = match[2];

			if (!yamlContent.includes('craftPostId:')) {
				yamlContent += `\ncraftPostId: ${craftData.craftPostId}`;
			}
			if (!yamlContent.includes('craftUrl:')) {
				yamlContent += `\ncraftUrl: "${craftData.craftUrl}"`;
			}

			const newContent = `---\n${yamlContent}\n---\n${bodyContent}`;
			await this.app.vault.modify(file, newContent);
		}
	}

	slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class UploadModal extends Modal {
	plugin: CraftCMSPlugin;
	asDraft: boolean = false;

	constructor(app: App, plugin: CraftCMSPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Upload to Craft CMS' });

		const form = contentEl.createDiv('craft-upload-form');

		const draftContainer = form.createDiv('setting-item');
		draftContainer.createEl('div', { text: 'Upload as draft', cls: 'setting-item-name' });
		const draftToggle = draftContainer.createEl('input', { type: 'checkbox' });
		draftToggle.addEventListener('change', () => {
			this.asDraft = draftToggle.checked;
		});

		const buttonContainer = form.createDiv('modal-button-container');
		
		const uploadBtn = buttonContainer.createEl('button', { 
			text: 'Upload Post', 
			cls: 'mod-cta' 
		});
		
		uploadBtn.addEventListener('click', async () => {
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
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ImageUploadModal extends Modal {
	plugin: CraftCMSPlugin;
	editor: Editor;
	selectedFile: File | null = null;
	imageUrl: string = '';
	filename: string = '';
	previewContainer: HTMLElement;

	constructor(app: App, plugin: CraftCMSPlugin, editor: Editor) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
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

	addCustomStyles() {
		const style = document.createElement('style');
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

	extractFilenameFromUrl(url: string): string {
		try {
			// Try to get filename from URL path
			const urlObj = new URL(url);
			let filename = urlObj.pathname.split('/').pop() || '';
			
			// Remove query parameters if they exist
			filename = filename.split('?')[0];
			
			// If we got a weird filename or no filename, generate a clean one
			if (!filename || filename.length < 3 || filename.includes('@') || 
				filename.startsWith('bafkrei') || filename.length > 50) {
				
				// Use domain + timestamp for a clean filename
				const domain = urlObj.hostname.replace(/^www\./, '');
				const timestamp = Date.now().toString(36); // Base36 for shorter string
				filename = `${domain}-${timestamp}.jpg`;
			}
			
			// Ensure it has a proper extension
			if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
				// Try to determine extension from URL or default to jpg
				if (url.toLowerCase().includes('png')) {
					filename += '.png';
				} else if (url.toLowerCase().includes('gif')) {
					filename += '.gif';
				} else if (url.toLowerCase().includes('webp')) {
					filename += '.webp';
				} else {
					filename += '.jpg';
				}
			}
			
			// Clean up the filename
			filename = filename
				.replace(/[^a-zA-Z0-9.-]/g, '-') // Replace special chars with dashes
				.replace(/-+/g, '-') // Collapse multiple dashes
				.replace(/^-|-$/g, ''); // Remove leading/trailing dashes
			
			console.log('🏷️ Generated filename from URL:', filename);
			return filename;
			
		} catch (error) {
			console.warn('Could not parse URL, using default filename');
			return `image-${Date.now()}.jpg`;
		}
	}

	sanitizeFilename(filename: string): string {
	if (!filename) return '';
	
	// Remove or replace problematic characters
	return filename
		.replace(/[<>:"/\\|?*@]/g, '-') // Replace problematic chars
		.replace(/^\.+/, '') // Remove leading dots
		.replace(/\.+$/, '') // Remove trailing dots  
		.replace(/-+/g, '-') // Collapse multiple dashes
		.replace(/^-|-$/g, '') // Remove leading/trailing dashes
		.substring(0, 100); // Limit length
	}


	setupEventListeners(fileInput: HTMLInputElement, urlInput: HTMLInputElement, 
					   filenameInput: HTMLInputElement, dropZone: HTMLElement,
					   uploadBtn: HTMLButtonElement, cancelBtn: HTMLButtonElement) {
		
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
				let urlFilename = this.extractFilenameFromUrl(this.imageUrl);
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

	updatePreview() {
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

	async handleUpload() {
		// Clean up the filename before validation
		this.filename = this.sanitizeFilename(this.filename);
		
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

			let imageData: ArrayBuffer;

			if (this.selectedFile) {
				// Local file upload
				imageData = await this.selectedFile.arrayBuffer();
				console.log('📁 Using local file:', this.selectedFile.name, this.selectedFile.size, 'bytes');
			} else {
				// URL download with better error handling
				console.log('🌐 Downloading from URL:', this.imageUrl);
				
				try {
					const response = await requestUrl({
						url: this.imageUrl,
						method: 'GET',
						headers: {
							'User-Agent': 'Mozilla/5.0 (compatible; ObsidianBot/1.0)'
						}
					});

					console.log('📡 URL response status:', response.status);
					console.log('📡 URL response headers:', response.headers);
					
					if (response.status !== 200) {
						throw new Error(`Failed to download image: HTTP ${response.status}`);
					}

					// Check if we got actual image data
					const contentType = response.headers['content-type'] || response.headers['Content-Type'];
					console.log('📄 Content type:', contentType);
					
					if (contentType && !contentType.startsWith('image/')) {
						throw new Error(`URL returned ${contentType}, expected image content`);
					}

					imageData = response.arrayBuffer;
					console.log('✅ Downloaded image data:', imageData.byteLength, 'bytes');

					if (imageData.byteLength === 0) {
						throw new Error('Downloaded image has no content');
					}

				} catch (urlError) {
					console.error('💥 URL download failed:', urlError);
					new Notice(`Failed to download image from URL: ${urlError.message}`);
					return;
				}
			}

			// Proceed with upload
			console.log('🚀 Starting Craft CMS upload...');
			const result = await this.plugin.uploadImageToCraft(imageData, this.filename);
			const assetCode = `{asset:${result.id}:img}`;
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

class CraftCMSSettingTab extends PluginSettingTab {
	plugin: CraftCMSPlugin;

	constructor(app: App, plugin: CraftCMSPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Craft CMS Settings' });

		new Setting(containerEl)
			.setName('GraphQL Endpoint')
			.setDesc('Your Craft CMS GraphQL API endpoint')
			.addText(text => text
				.setPlaceholder('https://your-site.com/index.php?action=graphql/api')
				.setValue(this.plugin.settings.endpoint)
				.onChange(async (value) => {
					this.plugin.settings.endpoint = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Base URL')
			.setDesc('Your Craft CMS base URL (for admin links)')
			.addText(text => text
				.setPlaceholder('https://your-site.com')
				.setValue(this.plugin.settings.baseUrl)
				.onChange(async (value) => {
					this.plugin.settings.baseUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API Token')
			.setDesc('Your Craft CMS API token for authentication')
			.addText(text => text
				.setPlaceholder('Your API token')
				.setValue(this.plugin.settings.token)
				.onChange(async (value) => {
					this.plugin.settings.token = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Section Handle')
			.setDesc('The handle of the section where posts should be created')
			.addText(text => text
				.setPlaceholder('posts')
				.setValue(this.plugin.settings.sectionHandle)
				.onChange(async (value) => {
					this.plugin.settings.sectionHandle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Author ID')
			.setDesc('Default author ID for posts')
			.addText(text => text
				.setPlaceholder('1')
				.setValue(this.plugin.settings.authorId)
				.onChange(async (value) => {
					this.plugin.settings.authorId = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-save Post ID')
			.setDesc('Automatically save Craft CMS post ID to frontmatter after upload')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSavePostId)
				.onChange(async (value) => {
					this.plugin.settings.autoSavePostId = value;
					await this.plugin.saveSettings();
				}));
	}
}