import { App, MarkdownView, Notice, TFile } from 'obsidian';
import { slugify } from './textUtils';

export class QuickFrontmatterGenerator {
	constructor(private app: App) {}

	async generateQuickFrontmatter(file?: TFile): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const targetFile = file || activeView?.file;
		
		if (!targetFile) {
			new Notice('No active file found');
			return;
		}

		try {
			// Get file basename as default title
			const defaultTitle = targetFile.basename;
			const defaultSlug = slugify(defaultTitle);
			
			// Generate timestamp for current time
			const now = new Date();
			const isoDate = now.toISOString();

			// Create minimal but complete frontmatter
			const frontmatter = [
				'---',
				`title: "${defaultTitle}"`,
				`slug: "${defaultSlug}"`,
				'deck: ""',
				'shortDeck: ""',
				`postDate: "${isoDate}"`,
				'enabled: true',
				'metaHeadline: ""',
				'metaDescription: ""',
				'socialBlurb: ""',
				'image: ""',
				'postAuthor: ""',
				'category: ""',
				'tags: []',
				'---',
				'',
				''
			].join('\n');

			// Read current content
			const currentContent = await this.app.vault.read(targetFile);
			
			if (currentContent.trim().length === 0) {
				// Empty file - just add frontmatter
				await this.app.vault.modify(targetFile, frontmatter);
				new Notice('✅ Quick frontmatter added!');
			} else if (!currentContent.startsWith('---')) {
				// No existing frontmatter - prepend it
				await this.app.vault.modify(targetFile, frontmatter + '\n' + currentContent);
				new Notice('✅ Quick frontmatter prepended!');
			} else {
				// Already has frontmatter - copy to clipboard instead
				navigator.clipboard.writeText(frontmatter);
				new Notice('📋 Frontmatter copied to clipboard (file already has frontmatter)');
			}

		} catch (error) {
			console.error('💥 Quick frontmatter generation failed:', error);
			new Notice(`Generation failed: ${error.message}`);
		}
	}

	async generateTomorrowPost(file?: TFile): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const targetFile = file || activeView?.file;
		
		if (!targetFile) {
			new Notice('No active file found');
			return;
		}

		try {
			const defaultTitle = targetFile.basename;
			const defaultSlug = slugify(defaultTitle);
			
			// Set for 2:10 AM tomorrow (matching your pattern)
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			tomorrow.setHours(2, 10, 0, 0);
			const isoDate = tomorrow.toISOString();

			const frontmatter = [
				'---',
				`title: "${defaultTitle}"`,
				`slug: "${defaultSlug}"`,
				'deck: ""',
				'shortDeck: ""',
				`postDate: "${isoDate}"`,
				'enabled: true',
				'metaHeadline: ""',
				'metaDescription: ""',
				'socialBlurb: ""',
				'image: ""',
				'postAuthor: ""',
				'category: ""',
				'tags: []',
				'---',
				'',
				''
			].join('\n');

			const currentContent = await this.app.vault.read(targetFile);
			
			if (currentContent.trim().length === 0) {
				await this.app.vault.modify(targetFile, frontmatter);
				new Notice('✅ Tomorrow\'s post frontmatter added!');
			} else if (!currentContent.startsWith('---')) {
				await this.app.vault.modify(targetFile, frontmatter + '\n' + currentContent);
				new Notice('✅ Tomorrow\'s post frontmatter prepended!');
			} else {
				navigator.clipboard.writeText(frontmatter);
				new Notice('📋 Tomorrow\'s frontmatter copied to clipboard');
			}

		} catch (error) {
			console.error('💥 Tomorrow post generation failed:', error);
			new Notice(`Generation failed: ${error.message}`);
		}
	}
}