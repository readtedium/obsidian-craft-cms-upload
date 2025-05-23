import { App, Modal, Notice } from 'obsidian';
import CraftCMSPlugin from '../../main';
import { SchemaManager, SchemaSummary } from '../api/schemaManager';

export class SchemaAnalysisModal extends Modal {
	private plugin: CraftCMSPlugin;
	private schemaManager: SchemaManager;

	constructor(app: App, plugin: CraftCMSPlugin) {
		super(app);
		this.plugin = plugin;
		this.schemaManager = new SchemaManager(plugin.api);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.addModalStyles();

		// Header
		const header = contentEl.createDiv('schema-modal-header');
		header.innerHTML = `
			<div class="schema-header-content">
				<svg class="schema-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2L22 8.5V15.5L12 22L2 15.5V8.5L12 2Z"/>
					<path d="M12 8.5V22"/>
					<path d="M22 8.5L12 15L2 8.5"/>
				</svg>
				<div>
					<h2>Schema Analysis</h2>
					<p>Discover your Craft CMS content structure</p>
				</div>
			</div>
		`;

		const content = contentEl.createDiv('schema-modal-content');

		// Show loading state initially
		this.showLoading(content);

		// Start analysis
		this.performAnalysis(content);
	}

	private showLoading(container: HTMLElement) {
		container.innerHTML = `
			<div class="schema-loading">
				<div class="schema-spinner">🔄</div>
				<h3>Analyzing Schema...</h3>
				<p>Discovering your Craft CMS content types and fields</p>
			</div>
		`;
	}

	private async performAnalysis(container: HTMLElement) {
		try {
			const cacheStatus = this.schemaManager.getCacheStatus();
			const forceRefresh = !cacheStatus.isCached || cacheStatus.minutesOld > 5;

			const summary = await this.schemaManager.getSchemaSummary();
			this.showResults(container, summary);

		} catch (error) {
			this.showError(container, error);
		}
	}

	private showResults(container: HTMLElement, summary: SchemaSummary) {
		container.empty();

		// Summary stats
		const statsSection = container.createDiv('schema-stats');
		statsSection.innerHTML = `
			<h3>📊 Schema Overview</h3>
			<div class="schema-stat-cards">
				<div class="schema-stat-card">
					<div class="stat-value">${summary.sectionsCount}</div>
					<div class="stat-label">Sections</div>
				</div>
				<div class="schema-stat-card">
					<div class="stat-value">${summary.contentTypesCount}</div>
					<div class="stat-label">Content Types</div>
				</div>
				<div class="schema-stat-card">
					<div class="stat-value">${summary.totalFieldsCount}</div>
					<div class="stat-label">Total Fields</div>
				</div>
				<div class="schema-stat-card">
					<div class="stat-value">${summary.customFieldsCount}</div>
					<div class="stat-label">Custom Fields</div>
				</div>
			</div>
			<div class="schema-last-analysis">
				Last analyzed: ${summary.lastAnalysis.toLocaleString()}
			</div>
		`;

		// Detailed breakdown
		const detailsSection = container.createDiv('schema-details');
		detailsSection.innerHTML = '<h3>🏗️ Content Structure</h3>';

		for (const section of summary.sections) {
			const sectionEl = detailsSection.createDiv('schema-section');
			
			const sectionHeader = sectionEl.createDiv('schema-section-header');
			sectionHeader.innerHTML = `
				<h4>${section.name} (${section.handle})</h4>
				<span class="entry-type-count">${section.entryTypes.length} entry types</span>
			`;

			const entryTypesList = sectionEl.createDiv('schema-entry-types');
			
			for (const entryType of section.entryTypes) {
				const entryTypeEl = entryTypesList.createDiv('schema-entry-type');
				entryTypeEl.innerHTML = `
					<div class="entry-type-name">${entryType.name}</div>
					<div class="entry-type-handle">${entryType.handle}</div>
					<div class="entry-type-fields">${entryType.fieldsCount} fields</div>
				`;

				// Add click handler to show field details
				entryTypeEl.addEventListener('click', () => {
					this.showContentTypeDetails(entryType.handle);
				});
			}
		}

		// Action buttons
		const buttonsSection = container.createDiv('schema-buttons');
		
		const refreshBtn = buttonsSection.createEl('button', {
			text: '🔄 Refresh Analysis',
			cls: 'schema-refresh-btn'
		});

		refreshBtn.addEventListener('click', async () => {
			this.schemaManager.clearCache();
			this.showLoading(container);
			await this.performAnalysis(container);
		});

		const closeBtn = buttonsSection.createEl('button', {
			text: 'Close',
			cls: 'schema-close-btn'
		});

		closeBtn.addEventListener('click', () => this.close());
	}

	private showError(container: HTMLElement, error: any) {
		container.innerHTML = `
			<div class="schema-error">
				<h3>❌ Analysis Failed</h3>
				<p>Unable to analyze your Craft CMS schema:</p>
				<div class="error-message">${error.message}</div>
				<p>Make sure your API token has the proper permissions to introspect the GraphQL schema.</p>
			</div>
		`;

		const retryBtn = container.createEl('button', {
			text: 'Retry Analysis',
			cls: 'schema-retry-btn'
		});

		retryBtn.addEventListener('click', () => {
			this.showLoading(container);
			this.performAnalysis(container);
		});
	}

	private async showContentTypeDetails(handle: string) {
		try {
			const formFields = await this.schemaManager.getFormFields(handle);
			const contentType = await this.schemaManager.getContentType(handle);
			
			new Notice(`${contentType?.name} has ${formFields.length} available fields`);
			
			// Log detailed field information for debugging
			console.log('📋 Content type fields:', formFields);
			console.log('🔍 Full content type:', contentType);
			
		} catch (error) {
			new Notice(`Failed to load details for ${handle}`);
			console.error('Field details error:', error);
		}
	}

	private addModalStyles() {
		if (!document.querySelector('#schema-modal-css')) {
			const style = document.createElement('style');
			style.id = 'schema-modal-css';
			style.textContent = `
				.schema-modal-header {
					background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
					margin: -20px -20px 20px -20px;
					padding: 20px;
					border-radius: 8px 8px 0 0;
					color: white;
				}

				.schema-header-content {
					display: flex;
					align-items: center;
					gap: 16px;
				}

				.schema-header-content h2 {
					margin: 0 0 4px 0;
					font-size: 1.5rem;
				}

				.schema-header-content p {
					margin: 0;
					opacity: 0.9;
				}

				.schema-modal-content {
					max-height: 70vh;
					overflow-y: auto;
				}

				.schema-loading {
					text-align: center;
					padding: 40px 20px;
				}

				.schema-spinner {
					font-size: 2rem;
					animation: spin 1s linear infinite;
				}

				@keyframes spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}

				.schema-stats {
					margin-bottom: 24px;
				}

				.schema-stat-cards {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
					gap: 12px;
					margin: 16px 0;
				}

				.schema-stat-card {
					background: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 6px;
					padding: 16px;
					text-align: center;
				}

				.stat-value {
					font-size: 1.5rem;
					font-weight: bold;
					color: var(--text-accent);
				}

				.stat-label {
					font-size: 0.85rem;
					color: var(--text-muted);
					margin-top: 4px;
				}

				.schema-last-analysis {
					font-size: 0.85rem;
					color: var(--text-muted);
					text-align: center;
					margin-top: 12px;
				}

				.schema-section {
					margin-bottom: 20px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 6px;
					overflow: hidden;
				}

				.schema-section-header {
					background: var(--background-secondary);
					padding: 12px 16px;
					display: flex;
					justify-content: space-between;
					align-items: center;
				}

				.schema-section-header h4 {
					margin: 0;
					color: var(--text-normal);
				}

				.entry-type-count {
					font-size: 0.85rem;
					color: var(--text-muted);
				}

				.schema-entry-types {
					padding: 8px;
				}

				.schema-entry-type {
					padding: 12px;
					border-radius: 4px;
					cursor: pointer;
					transition: background-color 0.2s;
					display: flex;
					justify-content: space-between;
					align-items: center;
				}

				.schema-entry-type:hover {
					background: var(--background-modifier-hover);
				}

				.entry-type-name {
					font-weight: 500;
				}

				.entry-type-handle {
					font-family: monospace;
					font-size: 0.85rem;
					color: var(--text-muted);
				}

				.entry-type-fields {
					font-size: 0.85rem;
					color: var(--text-accent);
				}

				.schema-buttons {
					display: flex;
					gap: 12px;
					justify-content: flex-end;
					margin-top: 24px;
					padding-top: 16px;
					border-top: 1px solid var(--background-modifier-border);
				}

				.schema-refresh-btn {
					background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
					color: white;
					border: none;
					padding: 8px 16px;
					border-radius: 4px;
					cursor: pointer;
					transition: opacity 0.2s;
				}

				.schema-refresh-btn:hover {
					opacity: 0.9;
				}

				.schema-close-btn {
					background: transparent;
					color: var(--text-muted);
					border: 1px solid var(--background-modifier-border);
					padding: 8px 16px;
					border-radius: 4px;
					cursor: pointer;
				}

				.schema-close-btn:hover {
					background: var(--background-modifier-hover);
				}

				.schema-error {
					text-align: center;
					padding: 40px 20px;
				}

				.error-message {
					background: var(--background-secondary);
					border: 1px solid var(--background-modifier-error);
					padding: 12px;
					border-radius: 4px;
					font-family: monospace;
					margin: 12px 0;
					color: var(--text-error);
				}

				.schema-retry-btn {
					background: var(--interactive-accent);
					color: white;
					border: none;
					padding: 8px 16px;
					border-radius: 4px;
					cursor: pointer;
					margin-top: 16px;
				}

				.schema-retry-btn:hover {
					opacity: 0.9;
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