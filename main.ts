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
			id: 'debug-asset-schema',
			name: 'Debug asset upload schema',
			callback: () => {
				this.debugAssetSchema();
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
			id: 'test-craft-mutation',
			name: 'Test Craft CMS mutation capability',
			callback: () => {
				this.testMutationCapability();
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

	async debugAssetSchema() {
		if (!this.settings.token) {
			new Notice('Please configure your API token first');
			return;
		}

		// Check what arguments the save_images_Asset mutation actually accepts
		const introspectionQuery = `
			query AssetMutationInfo {
				__schema {
					mutationType {
						fields {
							name
							args {
								name
								type {
									name
									kind
								}
							}
						}
					}
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
					query: introspectionQuery
				})
			});

			const mutations = response.json.data.__schema.mutationType.fields;
			const assetMutation = mutations.find((field: any) => field.name === 'save_images_Asset');
			
			if (assetMutation) {
				console.log('🔍 Asset mutation details:', assetMutation);
				new Notice('Check console for asset mutation schema details');
			} else {
				console.log('❌ save_images_Asset mutation not found');
				console.log('🔍 Available mutations:', mutations.map((m: any) => m.name).filter((name: string) => name.includes('Asset') || name.includes('asset')));
				new Notice('Asset mutation not found - check console for alternatives');
			}

		} catch (error) {
			console.error('Schema debugging failed:', error);
			new Notice(`Schema debug failed: ${error.message}`);
		}
	}

	async uploadImageToCraft(imageData: ArrayBuffer, filename: string): Promise<{ id: string, url: string }> {
		console.log('🖼️ Uploading image to Craft CMS:', filename);

		const base64Data = this.arrayBufferToBase64(imageData);

		const uploadMutation = `
			mutation UploadAsset($filename: String!, $data: String!) {
				save_images_Asset(
					filename: $filename
					tempFilePath: $data
				) {
					id
					url
					filename
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
						filename: filename,
						data: base64Data
					}
				})
			});

			console.log('📡 Image upload response:', response.json);

			if (response.json && response.json.errors) {
				console.error('💥 GraphQL errors:', response.json.errors);
				throw new Error(`GraphQL Error: ${JSON.stringify(response.json.errors)}`);
			}

			if (response.json && response.json.data && response.json.data.save_images_Asset) {
				const asset = response.json.data.save_images_Asset;
				console.log('✅ Image uploaded successfully:', asset);
				return { id: asset.id, url: asset.url };
			}

			throw new Error(`Unexpected response format: ${JSON.stringify(response.json)}`);

		} catch (error) {
			console.error('💥 Image upload failed:', error);
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

	async testMutationCapability() {
		if (!this.settings.token) {
			new Notice('Please configure your API token first');
			return;
		}

		const introspectionQuery = `
			query IntrospectionQuery {
				__schema {
					mutationType {
						name
						fields {
							name
							description
						}
					}
				}
			}
		`;

		try {
			new Notice('Testing mutation capability...');
			
			const response = await requestUrl({
				url: this.settings.endpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.settings.token}`
				},
				body: JSON.stringify({
					query: introspectionQuery
				})
			});

			console.log('🧪 Mutation test response:', response.json);

			if (response.status === 200 && response.json.data) {
				const mutations = response.json.data.__schema?.mutationType?.fields || [];
				console.log('🔧 Available mutations:', mutations);
				
				if (mutations.length > 0) {
					new Notice(`✅ Found ${mutations.length} mutations available`);
				} else {
					new Notice('❌ No mutations available - check schema permissions');
				}
			} else {
				new Notice('❌ Mutation test failed');
			}

		} catch (error) {
			console.error('Mutation test error:', error);
			new Notice(`Mutation test failed: ${error.message}`);
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

		contentEl.createEl('h2', { text: 'Upload Image to Craft CMS' });

		const form = contentEl.createDiv('image-upload-form');

		// File upload section
		const fileSection = form.createDiv('upload-section');
		fileSection.createEl('h3', { text: 'Select Image' });

		// Local file upload
		const fileContainer = fileSection.createDiv('file-container');
		fileContainer.createEl('label', { text: 'Choose local file:' });
		const fileInput = fileContainer.createEl('input', { type: 'file', attr: { accept: 'image/*' } });
		
		// URL input
		const urlContainer = fileSection.createDiv('url-container');
		urlContainer.createEl('label', { text: 'Or enter image URL:' });
		const urlInput = urlContainer.createEl('input', { type: 'url', placeholder: 'https://example.com/image.jpg' });
		
		// Filename input
		const nameSection = form.createDiv('name-section');
		nameSection.createEl('h3', { text: 'File Name' });
		const filenameInput = nameSection.createEl('input', { 
			type: 'text', 
			placeholder: 'image.jpg',
			value: this.filename
		});
		
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
		
		urlInput.addEventListener('input', () => {
			this.imageUrl = urlInput.value;
			if (this.imageUrl) {
				this.selectedFile = null;
				fileInput.value = '';
				const urlParts = this.imageUrl.split('/');
				const urlFilename = urlParts[urlParts.length - 1].split('?')[0];
				this.filename = urlFilename || 'image.jpg';
				filenameInput.value = this.filename;
				this.updatePreview();
			}
		});
		
		filenameInput.addEventListener('input', () => {
			this.filename = filenameInput.value;
		});

		// Preview section
		const previewSection = form.createDiv('preview-section');
		previewSection.createEl('h3', { text: 'Preview' });
		this.previewContainer = previewSection.createDiv('preview-container');
		this.previewContainer.style.border = '1px solid var(--background-modifier-border)';
		this.previewContainer.style.padding = '10px';
		this.previewContainer.style.minHeight = '100px';
		this.previewContainer.style.textAlign = 'center';

		// Buttons
		const buttonContainer = form.createDiv('modal-button-container');
		
		const uploadBtn = buttonContainer.createEl('button', { 
			text: 'Upload & Get Asset Code', 
			cls: 'mod-cta' 
		});
		
		uploadBtn.addEventListener('click', async () => {
			await this.handleUpload();
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		this.updatePreview();
	}

	updatePreview() {
		if (!this.previewContainer) return;

		this.previewContainer.empty();

		if (this.selectedFile) {
			const reader = new FileReader();
			reader.onload = (e) => {
				const img = this.previewContainer.createEl('img');
				img.src = e.target?.result as string;
				img.style.maxWidth = '200px';
				img.style.maxHeight = '200px';
			};
			reader.readAsDataURL(this.selectedFile);
		} else if (this.imageUrl) {
			const img = this.previewContainer.createEl('img');
			img.src = this.imageUrl;
			img.style.maxWidth = '200px';
			img.style.maxHeight = '200px';
			img.onerror = () => {
				this.previewContainer.empty();
				this.previewContainer.createEl('div', { text: '❌ Could not load image from URL' });
			};
		} else {
			this.previewContainer.createEl('div', { text: 'No image selected' });
		}
	}

	async handleUpload() {
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
				imageData = await this.selectedFile.arrayBuffer();
			} else {
				const response = await requestUrl({
					url: this.imageUrl,
					method: 'GET'
				});
				imageData = response.arrayBuffer;
			}

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