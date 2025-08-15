import { App, Modal, Notice, TFile, MarkdownView } from 'obsidian';
import CraftCMSPlugin from '../../main';
import { slugify } from '../utils/textUtils';

export class FrontmatterGeneratorModal extends Modal {
	private plugin: CraftCMSPlugin;
	private targetFile: TFile | null = null;

	constructor(app: App, plugin: CraftCMSPlugin, file?: TFile | null) {
		super(app);
		this.plugin = plugin;
		this.targetFile = file || null;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.addModalStyles();

		// Header
		const header = contentEl.createDiv('frontmatter-gen-header');
		header.innerHTML = `
			<div class="frontmatter-header-content">
				<svg class="frontmatter-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
					<polyline points="14,2 14,8 20,8"/>
					<line x1="16" y1="13" x2="8" y2="13"/>
					<line x1="16" y1="17" x2="8" y2="17"/>
					<polyline points="10,9 9,9 8,9"/>
				</svg>
				<div>
					<h2>Generate Frontmatter</h2>
					<p>Quick YAML starter for new posts</p>
				</div>
			</div>
		`;

		const form = contentEl.createDiv('frontmatter-gen-form');

		// Essential fields section
		const essentialSection = form.createDiv('frontmatter-section');
		essentialSection.createEl('h3', { text: '📝 Essential Fields' });

		// Title
		const titleContainer = essentialSection.createDiv('field-container');
		titleContainer.createEl('label', { text: 'Title', cls: 'field-label' });
		const titleInput = titleContainer.createEl('input', { 
			type: 'text', 
			placeholder: 'Your Post Title',
			cls: 'frontmatter-input'
		}) as HTMLInputElement;

		// Auto-generate slug from title
		const slugContainer = essentialSection.createDiv('field-container');
		slugContainer.createEl('label', { text: 'Slug', cls: 'field-label' });
		const slugInput = slugContainer.createEl('input', { 
			type: 'text', 
			placeholder: 'url-slug-auto-generated',
			cls: 'frontmatter-input'
		}) as HTMLInputElement;

		// Auto-update slug when title changes
		titleInput.addEventListener('input', () => {
			if (titleInput.value && !slugInput.dataset.manuallyEdited) {
				slugInput.value = slugify(titleInput.value);
			}
		});

		// Mark slug as manually edited if user changes it
		slugInput.addEventListener('input', () => {
			slugInput.dataset.manuallyEdited = 'true';
		});

		// Deck (subtitle)
		const deckContainer = essentialSection.createDiv('field-container');
		deckContainer.createEl('label', { text: 'Deck (Subtitle)', cls: 'field-label' });
		const deckInput = deckContainer.createEl('textarea', { 
			placeholder: 'A compelling subtitle that explains what this post is about',
			cls: 'frontmatter-textarea'
		}) as HTMLTextAreaElement;
		deckInput.rows = 2;

		// Short Deck
		const shortDeckContainer = essentialSection.createDiv('field-container');
		shortDeckContainer.createEl('label', { text: 'Short Deck', cls: 'field-label' });
		const shortDeckInput = shortDeckContainer.createEl('textarea', { 
			placeholder: 'Shorter version for social media',
			cls: 'frontmatter-textarea'
		}) as HTMLTextAreaElement;
		shortDeckInput.rows = 2;

		// SEO Section
		const seoSection = form.createDiv('frontmatter-section');
		seoSection.createEl('h3', { text: '🎯 SEO & Meta' });

		// Meta Headline
		const metaHeadlineContainer = seoSection.createDiv('field-container');
		metaHeadlineContainer.createEl('label', { text: 'Meta Headline (SEO Title)', cls: 'field-label' });
		const metaHeadlineInput = metaHeadlineContainer.createEl('input', { 
			type: 'text', 
			placeholder: 'SEO-optimized title (auto-filled from title)',
			cls: 'frontmatter-input'
		}) as HTMLInputElement;

		// Auto-fill meta headline from title
		titleInput.addEventListener('input', () => {
			if (titleInput.value && !metaHeadlineInput.dataset.manuallyEdited) {
				metaHeadlineInput.value = titleInput.value;
			}
		});

		metaHeadlineInput.addEventListener('input', () => {
			metaHeadlineInput.dataset.manuallyEdited = 'true';
		});

		// Meta Description
		const metaDescContainer = seoSection.createDiv('field-container');
		metaDescContainer.createEl('label', { text: 'Meta Description', cls: 'field-label' });
		const metaDescInput = metaDescContainer.createEl('textarea', { 
			placeholder: 'SEO description (auto-filled from deck)',
			cls: 'frontmatter-textarea'
		}) as HTMLTextAreaElement;
		metaDescInput.rows = 2;

		// Auto-fill meta description from deck
		deckInput.addEventListener('input', () => {
			if (deckInput.value && !metaDescInput.dataset.manuallyEdited) {
				metaDescInput.value = deckInput.value;
			}
		});

		metaDescInput.addEventListener('input', () => {
			metaDescInput.dataset.manuallyEdited = 'true';
		});

		// Social Section
		const socialSection = form.createDiv('frontmatter-section');
		socialSection.createEl('h3', { text: '📱 Social' });

		// Social Blurb
		const socialBlurbContainer = socialSection.createDiv('field-container');
		socialBlurbContainer.createEl('label', { text: 'Social Blurb', cls: 'field-label' });
		const socialBlurbInput = socialBlurbContainer.createEl('textarea', { 
			placeholder: 'Social media version (auto-filled from shortDeck)',
			cls: 'frontmatter-textarea'
		}) as HTMLTextAreaElement;
		socialBlurbInput.rows = 2;

		// Auto-fill social blurb from short deck
		shortDeckInput.addEventListener('input', () => {
			if (shortDeckInput.value && !socialBlurbInput.dataset.manuallyEdited) {
				socialBlurbInput.value = shortDeckInput.value;
			}
		});

		socialBlurbInput.addEventListener('input', () => {
			socialBlurbInput.dataset.manuallyEdited = 'true';
		});

		// Quick Tags Section
		const tagsSection = form.createDiv('frontmatter-section');
		tagsSection.createEl('h3', { text: '🏷️ Tags & Categories' });

		// Tags (comma-separated for easy editing)
		const tagsContainer = tagsSection.createDiv('field-container');
		tagsContainer.createEl('label', { text: 'Tags (comma-separated)', cls: 'field-label' });
		const tagsInput = tagsContainer.createEl('input', { 
			type: 'text', 
			placeholder: 'technology, history, obsolete tech, vintage computing',
			cls: 'frontmatter-input'
		}) as HTMLInputElement;

		// Pre-fill with common Tedium tags
		const commonTagsContainer = tagsContainer.createDiv('common-tags');
		commonTagsContainer.createEl('span', { text: 'Common tags: ', cls: 'common-tags-label' });
		
		const commonTags = [
			'technology', 'history', 'obsolete tech', 'vintage computing', 
			'corporate history', 'telecommunications', 'internet culture',
			'retro gaming', 'media history', 'business oddities'
		];

		commonTags.forEach(tag => {
			const tagBtn = commonTagsContainer.createEl('button', {
				text: tag,
				cls: 'common-tag-btn'
			});
			
			tagBtn.addEventListener('click', (e) => {
				e.preventDefault();
				const currentTags = tagsInput.value;
				const newTag = currentTags ? `, ${tag}` : tag;
				tagsInput.value += newTag;
			});
		});

		// Publishing Section
		const publishSection = form.createDiv('frontmatter-section');
		publishSection.createEl('h3', { text: '📅 Publishing' });

		// Publish Date with smart defaults
		const postDateContainer = publishSection.createDiv('field-container');
		postDateContainer.createEl('label', { text: 'Post Date', cls: 'field-label' });
		const postDateInput = postDateContainer.createEl('input', { 
			type: 'datetime-local', 
			cls: 'frontmatter-input'
		}) as HTMLInputElement;

		// Set default to current time
		const now = new Date();
		postDateInput.value = now.toISOString().slice(0, 16);

		// Quick time buttons
		const timeButtonsContainer = postDateContainer.createDiv('time-buttons');
		const quickTimes = [
			{ label: 'Now', offset: 0 },
			{ label: '9 AM Tomorrow', getTime: () => {
				const tomorrow = new Date();
				tomorrow.setDate(tomorrow.getDate() + 1);
				tomorrow.setHours(9, 0, 0, 0);
				return tomorrow;
			}},
			{ label: '2 AM Tomorrow', getTime: () => {
				const tomorrow = new Date();
				tomorrow.setDate(tomorrow.getDate() + 1);
				tomorrow.setHours(2, 10, 0, 0);
				return tomorrow;
			}}
		];

		quickTimes.forEach(({ label, offset, getTime }) => {
			const btn = timeButtonsContainer.createEl('button', {
				text: label,
				cls: 'time-btn'
			});
			
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				const time = getTime ? getTime() : new Date(Date.now() + (offset || 0));
				postDateInput.value = time.toISOString().slice(0, 16);
			});
		});

		// Enabled toggle
		const enabledContainer = publishSection.createDiv('field-container checkbox-container');
		const enabledInput = enabledContainer.createEl('input', { 
			type: 'checkbox', 
			cls: 'frontmatter-checkbox'
		}) as HTMLInputElement;
		enabledInput.checked = true; // Default to published
		enabledContainer.createEl('label', { text: 'Publish immediately', cls: 'checkbox-label' });

		// Action buttons
		const buttonContainer = form.createDiv('frontmatter-buttons');
		
		const generateBtn = buttonContainer.createEl('button', {
			text: '🚀 Generate & Insert',
			cls: 'frontmatter-generate-btn'
		});
		
		generateBtn.addEventListener('click', async () => {
			await this.handleGenerate({
				title: titleInput.value,
				slug: slugInput.value,
				deck: deckInput.value,
				shortDeck: shortDeckInput.value,
				metaHeadline: metaHeadlineInput.value,
				metaDescription: metaDescInput.value,
				socialBlurb: socialBlurbInput.value,
				tags: tagsInput.value,
				postDate: postDateInput.value,
				enabled: enabledInput.checked
			});
		});

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'frontmatter-cancel-btn'
		});
		
		cancelBtn.addEventListener('click', () => this.close());

		// Focus on title input
		setTimeout(() => titleInput.focus(), 100);
	}

	private async handleGenerate(data: any) {
		try {
			// Convert datetime-local to ISO string with timezone
			const postDateTime = new Date(data.postDate);
			const isoDate = postDateTime.toISOString();

			// Process tags - split comma-separated into array
			const tagsArray = data.tags 
				? data.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0)
				: [];

			// Generate YAML frontmatter
			const frontmatter = [
				'---',
				`title: "${data.title || 'New Post'}"`,
				`slug: "${data.slug || slugify(data.title || 'new-post')}"`,
				...(data.deck ? [`deck: "${data.deck}"`] : []),
				...(data.shortDeck ? [`shortDeck: "${data.shortDeck}"`] : []),
				`postDate: "${isoDate}"`,
				`enabled: ${data.enabled}`,
				...(data.metaHeadline ? [`metaHeadline: "${data.metaHeadline}"`] : []),
				...(data.metaDescription ? [`metaDescription: "${data.metaDescription}"`] : []),
				...(data.socialBlurb ? [`socialBlurb: "${data.socialBlurb}"`] : []),
				// Always include common fields with placeholder values
				'image: ""',
				'postAuthor: ""', 
				'category: ""',
				// Tags in YAML array format
				...(tagsArray.length > 0 ? [
					'tags:',
					...tagsArray.map((tag: string) => `  - ${tag}`)
				] : ['tags: []']),
				'---',
				'',
				'Your article content goes here...',
				''
			].join('\n');

			// Insert into current file or create new file
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			
			if (this.targetFile && activeView?.file === this.targetFile) {
				// Insert at cursor position
				const editor = activeView.editor;
				const cursor = editor.getCursor();
				editor.replaceRange(frontmatter, cursor);
				new Notice('✅ Frontmatter inserted!');
			} else if (activeView?.file) {
				// Replace file content (assuming it's a new file)
				const currentContent = await this.app.vault.read(activeView.file);
				if (currentContent.trim().length === 0) {
					await this.app.vault.modify(activeView.file, frontmatter);
					new Notice('✅ Frontmatter added to file!');
				} else {
					// Insert at beginning
					await this.app.vault.modify(activeView.file, frontmatter + '\n' + currentContent);
					new Notice('✅ Frontmatter prepended to file!');
				}
			} else {
				// Copy to clipboard as fallback
				navigator.clipboard.writeText(frontmatter);
				new Notice('📋 Frontmatter copied to clipboard!');
			}

			this.close();

		} catch (error) {
			console.error('💥 Frontmatter generation failed:', error);
			new Notice(`Generation failed: ${error.message}`);
		}
	}

	private addModalStyles() {
		if (!document.querySelector('#frontmatter-gen-modal-css')) {
			const style = document.createElement('style');
			style.id = 'frontmatter-gen-modal-css';
			style.textContent = `
				.modal:has(.frontmatter-gen-header) {
					max-width: 800px !important;
					width: 800px !important;
				}

				.frontmatter-gen-header {
					background: linear-gradient(135deg, #10b981 0%, #059669 100%);
					margin: -20px -20px 20px -20px;
					padding: 20px;
					border-radius: 8px 8px 0 0;
					color: white;
				}

				.frontmatter-header-content {
					display: flex;
					align-items: center;
					gap: 16px;
				}

				.frontmatter-header-content h2 {
					margin: 0 0 4px 0;
					font-size: 1.5rem;
				}

				.frontmatter-header-content p {
					margin: 0;
					opacity: 0.9;
				}

				.frontmatter-gen-form {
					max-height: 70vh;
					overflow-y: auto;
					padding: 0 4px;
				}

				.frontmatter-section {
					margin-bottom: 24px;
					padding-bottom: 16px;
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.frontmatter-section:last-of-type {
					border-bottom: none;
				}

				.frontmatter-section h3 {
					margin: 0 0 12px 0;
					color: var(--text-normal);
					font-size: 1rem;
				}

				.field-container {
					margin-bottom: 16px;
				}

				.field-label {
					display: block;
					margin-bottom: 6px;
					font-weight: 600;
					color: var(--text-normal);
				}

				.frontmatter-input,
				.frontmatter-textarea {
					width: 100%;
					padding: 10px 14px;
					border: 2px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-primary);
					color: var(--text-normal);
					transition: border-color 0.2s ease;
					font-family: var(--font-interface);
				}

				.frontmatter-input:focus,
				.frontmatter-textarea:focus {
					outline: none;
					border-color: var(--interactive-accent);
					box-shadow: 0 0 0 2px var(--interactive-accent-hover);
				}

				.frontmatter-textarea {
					resize: vertical;
					min-height: 50px;
					font-family: var(--font-text);
				}

				.common-tags {
					margin-top: 8px;
					display: flex;
					flex-wrap: wrap;
					gap: 6px;
					align-items: center;
				}

				.common-tags-label {
					font-size: 0.85rem;
					color: var(--text-muted);
					margin-right: 6px;
				}

				.common-tag-btn {
					background: var(--background-secondary);
					color: var(--text-muted);
					border: 1px solid var(--background-modifier-border);
					padding: 4px 8px;
					border-radius: 12px;
					font-size: 0.8rem;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.common-tag-btn:hover {
					background: var(--interactive-accent);
					color: white;
					border-color: var(--interactive-accent);
				}

				.time-buttons {
					display: flex;
					gap: 8px;
					margin-top: 8px;
				}

				.time-btn {
					background: var(--background-secondary);
					color: var(--text-normal);
					border: 1px solid var(--background-modifier-border);
					padding: 6px 12px;
					border-radius: 4px;
					font-size: 0.85rem;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.time-btn:hover {
					background: var(--interactive-accent);
					color: white;
					border-color: var(--interactive-accent);
				}

				.checkbox-container {
					display: flex;
					align-items: center;
					gap: 10px;
				}

				.frontmatter-checkbox {
					width: auto !important;
					margin: 0 !important;
				}

				.checkbox-label {
					margin: 0 !important;
					font-weight: 500 !important;
					cursor: pointer;
				}

				.frontmatter-buttons {
					display: flex;
					gap: 12px;
					justify-content: flex-end;
					margin-top: 24px;
					padding-top: 16px;
					border-top: 1px solid var(--background-modifier-border);
				}

				.frontmatter-generate-btn {
					background: linear-gradient(135deg, #10b981 0%, #059669 100%);
					color: white;
					border: none;
					padding: 12px 24px;
					border-radius: 6px;
					font-weight: 500;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.frontmatter-generate-btn:hover {
					transform: translateY(-1px);
					box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
				}

				.frontmatter-cancel-btn {
					background: transparent;
					color: var(--text-muted);
					border: 1px solid var(--background-modifier-border);
					padding: 12px 24px;
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.frontmatter-cancel-btn:hover {
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