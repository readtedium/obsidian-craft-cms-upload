import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from 'obsidian';
import { parseYaml } from 'obsidian';

interface CraftCMSSettings {
	endpoint: string;
	token: string;
	sectionHandle: string;
	authorId: string;
}

const DEFAULT_SETTINGS: CraftCMSSettings = {
	endpoint: 'https://old.tedium.co/index.php?action=graphql/api',
	token: '',
	sectionHandle: 'posts',
	authorId: '1'
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
		await this.loadSettings();

		// Add ribbon icon for quick upload
		const ribbonIconEl = this.addRibbonIcon('upload', 'Upload to Craft CMS', (evt: MouseEvent) => {
			this.uploadCurrentPost();
		});
		ribbonIconEl.addClass('craft-cms-ribbon-class');

		// Add command to upload current post
		this.addCommand({
			id: 'upload-current-post',
			name: 'Upload current post to Craft CMS',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.uploadCurrentPost();
			}
		});

		// Add command to upload with dialog
		this.addCommand({
			id: 'upload-post-dialog',
			name: 'Upload post to Craft CMS (with options)',
			callback: () => {
				new UploadModal(this.app, this).open();
			}
		});

		// Add settings tab
		this.addSettingTab(new CraftCMSSettingTab(this.app, this));
	}

	async uploadCurrentPost() {
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
			await this.uploadPost(file);
		} catch (error) {
			console.error('Upload failed:', error);
			new Notice(`Upload failed: ${error.message}`);
		}
	}

	async uploadPost(file: TFile, options?: { asDraft?: boolean }) {
		if (!this.settings.token) {
			new Notice('Please configure your Craft CMS token in settings');
			return;
		}

		new Notice('Starting upload...');

		// Read file content
		const content = await this.app.vault.read(file);
		const { frontmatter, body } = this.parseFrontmatter(content);

		// Extract post data from frontmatter and content
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

		// Upload any images found in the post
		const updatedBody = await this.uploadImagesInContent(body, file);
		postData.body = updatedBody;

		// Upload featured image if it exists
		if (postData.featuredImage) {
			postData.featuredImage = await this.uploadImage(postData.featuredImage, file);
		}

		// Create the post via GraphQL
		await this.createPost(postData);

		new Notice('✅ Post uploaded successfully!');
	}

	parseFrontmatter(content: string): { frontmatter: any, body: string } {
		const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
		const match = content.match(frontmatterRegex);

		if (match) {
			try {
				const frontmatter = parseYaml(match[1]) || {};
				const body = match[2].trim();
				return { frontmatter, body };
			} catch (error) {
				console.error('Error parsing frontmatter:', error);
			}
		}

		return { frontmatter: {}, body: content };
	}

	async uploadImagesInContent(content: string, currentFile: TFile): Promise<string> {
		// Find all image references in markdown
		const imageRegex = /!\[(.*?)\]\(([^)]+)\)/g;
		let updatedContent = content;
		const matches = [...content.matchAll(imageRegex)];

		for (const match of matches) {
			const [fullMatch, altText, imagePath] = match;
			
			try {
				const uploadedUrl = await this.uploadImage(imagePath, currentFile);
				if (uploadedUrl && uploadedUrl !== imagePath) {
					updatedContent = updatedContent.replace(fullMatch, `![${altText}](${uploadedUrl})`);
				}
			} catch (error) {
				console.warn(`Failed to upload image ${imagePath}:`, error);
			}
		}

		return updatedContent;
	}

	async uploadImage(imagePath: string, currentFile: TFile): Promise<string> {
		// If it's already a URL, return as-is
		if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
			return imagePath;
		}

		// Resolve the image file
		let imageFile: TFile | null = null;
		
		if (imagePath.startsWith('./') || imagePath.startsWith('../')) {
			// Relative path
			const resolvedPath = this.app.metadataCache.getFirstLinkpathDest(imagePath, currentFile.path);
			imageFile = resolvedPath instanceof TFile ? resolvedPath : null;
		} else {
			// Direct file reference
			imageFile = this.app.vault.getAbstractFileByPath(imagePath) as TFile;
			if (!imageFile) {
				// Try to find by name
				const files = this.app.vault.getFiles();
				imageFile = files.find(f => f.name === imagePath) || null;
			}
		}

		if (!imageFile) {
			console.warn(`Image file not found: ${imagePath}`);
			return imagePath;
		}

		// Read image data
		const imageData = await this.app.vault.readBinary(imageFile);
		const base64Data = this.arrayBufferToBase64(imageData);

		// Upload via GraphQL mutation
		const uploadMutation = `
			mutation UploadAsset($filename: String!, $data: String!) {
				save_asset(
					filename: $filename
					data: $data
				) {
					id
					url
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
						filename: imageFile.name,
						data: base64Data
					}
				})
			});

			if (response.json.errors) {
				throw new Error(response.json.errors[0].message);
			}

			return response.json.data.save_asset.url;
		} catch (error) {
			console.error('Image upload failed:', error);
			return imagePath; // Return original path if upload fails
		}
	}

	async createPost(postData: PostData) {
		const createPostMutation = `
			mutation CreatePost(
				$sectionHandle: [String]!
				$title: String!
				$body: String!
				$deck: String
				$shortDeck: String
				$slug: String
				$metaHeadline: String
				$metaDescription: String
				$enabled: Boolean
				$postDate: String
				$authorId: [String]
				$tags: [String]
				$featuredImage: [String]
				$sidebarAdToggle: Boolean
				$topBarAdToggle: Boolean
				$bottomAdToggle: Boolean
				$optimizeAds: Boolean
			) {
				save_posts_Post(
					sectionId: $sectionHandle
					title: $title
					body: $body
					deck: $deck
					shortDeck: $shortDeck
					slug: $slug
					metaHeadline: $metaHeadline
					metaDescription: $metaDescription
					enabled: $enabled
					postDate: $postDate
					postAuthor: $authorId
					tags: $tags
					image: $featuredImage
					sidebarAdToggle: $sidebarAdToggle
					topBarAdToggle: $topBarAdToggle
					bottomAdToggle: $bottomAdToggle
					optimizeAds: $optimizeAds
				) {
					id
					title
					url
				}
			}
		`;

		const response = await requestUrl({
			url: this.settings.endpoint,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.token}`
			},
			body: JSON.stringify({
				query: createPostMutation,
				variables: {
					sectionHandle: [this.settings.sectionHandle],
					title: postData.title,
					body: postData.body,
					deck: postData.deck,
					shortDeck: postData.shortDeck,
					slug: postData.slug,
					metaHeadline: postData.metaHeadline,
					metaDescription: postData.metaDescription,
					enabled: postData.enabled,
					postDate: postData.postDate,
					authorId: [this.settings.authorId],
					tags: postData.tags,
					featuredImage: postData.featuredImage ? [postData.featuredImage] : [],
					sidebarAdToggle: postData.sidebarAdToggle,
					topBarAdToggle: postData.topBarAdToggle,
					bottomAdToggle: postData.bottomAdToggle,
					optimizeAds: postData.optimizeAds
				}
			})
		});

		if (response.json.errors) {
			throw new Error(response.json.errors[0].message);
		}

		return response.json.data.save_posts_Post;
	}

	arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
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

		// Draft checkbox
		const draftContainer = form.createDiv('setting-item');
		draftContainer.createEl('div', { text: 'Upload as draft', cls: 'setting-item-name' });
		const draftToggle = draftContainer.createEl('input', { type: 'checkbox' });
		draftToggle.addEventListener('change', () => {
			this.asDraft = draftToggle.checked;
		});

		// Buttons
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
				.setPlaceholder('https://your-site.com/api/graphql')
				.setValue(this.plugin.settings.endpoint)
				.onChange(async (value) => {
					this.plugin.settings.endpoint = value;
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

		// Add some helpful text
		containerEl.createEl('h3', { text: 'Front Matter Format' });
		const frontmatterExample = containerEl.createEl('pre');
		frontmatterExample.setText(`---
title: "Your Post Title"
deck: "Brief description or subtitle"
shortDeck: "Even shorter description"
slug: "your-post-slug"
metaHeadline: "SEO title"
metaDescription: "SEO description"
tags: ["tag1", "tag2"]
enabled: true
postDate: "2025-01-20"
featuredImage: "path/to/image.jpg"
sidebarAdToggle: true
topBarAdToggle: true
bottomAdToggle: true
optimizeAds: true
---`);
	}
}