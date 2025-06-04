// src/settings/settingsTab.ts - Updated with DateTime Settings
import { App, PluginSettingTab, Setting, Notice, requestUrl } from 'obsidian';
import CraftCMSPlugin from '../../main';
import { validateSettings } from './settings';

export class CraftCMSSettingTab extends PluginSettingTab {
	plugin: CraftCMSPlugin;

	constructor(app: App, plugin: CraftCMSPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Craft CMS Settings' });

		// Connection Status
		this.addConnectionStatus(containerEl);

		// API Settings
		this.addApiSettings(containerEl);

		// Content Settings  
		this.addContentSettings(containerEl);

		// NEW: Date & Time Settings
		this.addDateTimeSettings(containerEl);

		// Behavior Settings
		this.addBehaviorSettings(containerEl);

		// Webhook Settings
		this.addWebhookSettings(containerEl);

		// Test Connection Button
		this.addTestButton(containerEl);
	}

	private addConnectionStatus(containerEl: HTMLElement) {
		const statusContainer = containerEl.createDiv('craft-status-container');
		statusContainer.createEl('h3', { text: 'Connection Status' });
		
		const statusEl = statusContainer.createDiv('craft-connection-status');
		
		// We'll update this dynamically
		this.updateConnectionStatus(statusEl);
	}

	private async updateConnectionStatus(statusEl: HTMLElement) {
		statusEl.empty();
		
		const errors = validateSettings(this.plugin.settings);
		
		if (errors.length > 0) {
			statusEl.createDiv('craft-status-error').innerHTML = `
				<span class="craft-status-icon">❌</span>
				<span>Configuration incomplete: ${errors.join(', ')}</span>
			`;
		} else {
			statusEl.createDiv('craft-status-checking').innerHTML = `
				<span class="craft-status-icon">🔄</span>
				<span>Checking connection...</span>
			`;

			try {
				const isConnected = await this.plugin.api.testConnection();
				statusEl.empty();
				
				if (isConnected) {
					statusEl.createDiv('craft-status-success').innerHTML = `
						<span class="craft-status-icon">✅</span>
						<span>Connected to Craft CMS</span>
					`;
				} else {
					statusEl.createDiv('craft-status-error').innerHTML = `
						<span class="craft-status-icon">❌</span>
						<span>Unable to connect - check your settings</span>
					`;
				}
			} catch (error) {
				statusEl.empty();
				statusEl.createDiv('craft-status-error').innerHTML = `
					<span class="craft-status-icon">❌</span>
					<span>Connection failed: ${error.message}</span>
				`;
			}
		}
	}

	private addApiSettings(containerEl: HTMLElement) {
		containerEl.createEl('h3', { text: 'API Configuration' });

		new Setting(containerEl)
			.setName('GraphQL Endpoint')
			.setDesc('Your Craft CMS GraphQL API endpoint')
			.addText(text => text
				.setPlaceholder('https://your-site.com/index.php?action=graphql/api')
				.setValue(this.plugin.settings.endpoint)
				.onChange(async (value) => {
					this.plugin.settings.endpoint = value;
					await this.plugin.saveSettings();
					// Re-check connection status
					const statusEl = containerEl.querySelector('.craft-connection-status') as HTMLElement;
					if (statusEl) this.updateConnectionStatus(statusEl);
				}));

		new Setting(containerEl)
			.setName('API Token')
			.setDesc('Your Craft CMS API token for authentication')
			.addText(text => {
				text.inputEl.type = 'password';
				return text
					.setPlaceholder('Your API token')
					.setValue(this.plugin.settings.token)
					.onChange(async (value) => {
						this.plugin.settings.token = value;
						await this.plugin.saveSettings();
						// Re-check connection status
						const statusEl = containerEl.querySelector('.craft-connection-status') as HTMLElement;
						if (statusEl) this.updateConnectionStatus(statusEl);
					});
			});

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
	}

	private addContentSettings(containerEl: HTMLElement) {
		containerEl.createEl('h3', { text: 'Content Settings' });

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
	}

	// NEW: Date & Time Settings Section
	private addDateTimeSettings(containerEl: HTMLElement) {
		containerEl.createEl('h3', { text: 'Date & Time Settings' });

		// Timezone setting
		new Setting(containerEl)
			.setName('Timezone')
			.setDesc('Your site\'s timezone for post scheduling')
			.addDropdown(dropdown => {
				const timezones = [
					{ value: 'UTC', label: 'UTC' },
					{ value: 'America/New_York', label: 'Eastern Time (US)' },
					{ value: 'America/Chicago', label: 'Central Time (US)' },
					{ value: 'America/Denver', label: 'Mountain Time (US)' },
					{ value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
					{ value: 'America/Toronto', label: 'Toronto' },
					{ value: 'Europe/London', label: 'London' },
					{ value: 'Europe/Paris', label: 'Paris' },
					{ value: 'Europe/Berlin', label: 'Berlin' },
					{ value: 'Asia/Tokyo', label: 'Tokyo' },
					{ value: 'Australia/Sydney', label: 'Sydney' }
				];

				timezones.forEach(tz => {
					dropdown.addOption(tz.value, tz.label);
				});

				dropdown
					.setValue(this.plugin.settings.timezone || 'America/New_York')
					.onChange(async (value) => {
						this.plugin.settings.timezone = value;
						await this.plugin.saveSettings();
					});
			});

		// Default post time
		new Setting(containerEl)
			.setName('Default Post Time')
			.setDesc('Default time for new posts (24-hour format, e.g., 09:00 for 9 AM)')
			.addText(text => text
				.setPlaceholder('09:00')
				.setValue(this.plugin.settings.defaultPostTime || '09:00')
				.onChange(async (value) => {
					// Validate time format
					if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
						this.plugin.settings.defaultPostTime = value;
						await this.plugin.saveSettings();
					}
				}));

		// Date format preference (for future use)
		new Setting(containerEl)
			.setName('Date Format')
			.setDesc('How dates should be formatted for Craft CMS')
			.addDropdown(dropdown => {
				dropdown
					.addOption('iso', 'ISO 8601 (recommended)')
					.addOption('craft', 'Craft CMS format')
					.setValue(this.plugin.settings.dateFormat || 'iso')
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value as 'iso' | 'craft';
						await this.plugin.saveSettings();
					});
			});

		// Timezone detection helper
		const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const currentTime = new Date().toLocaleString('en-US', {
			timeZone: this.plugin.settings.timezone || detectedTz,
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			timeZoneName: 'short'
		});

		const tzInfo = containerEl.createDiv('timezone-info');
		tzInfo.innerHTML = `
			<div style="background: var(--background-secondary); padding: 12px; border-radius: 6px; margin-top: 8px; border: 1px solid var(--background-modifier-border);">
				<div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 4px;">
					<strong>🌍 Timezone Info:</strong>
				</div>
				<div style="font-size: 0.85rem; color: var(--text-muted);">
					<div>Detected: ${detectedTz}</div>
					<div>Selected: ${this.plugin.settings.timezone || 'UTC'}</div>
					<div>Current time: ${currentTime}</div>
				</div>
			</div>
		`;
	}

	private addBehaviorSettings(containerEl: HTMLElement) {
		containerEl.createEl('h3', { text: 'Behavior Settings' });

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

	private addWebhookSettings(containerEl: HTMLElement) {
		containerEl.createEl('h3', { text: 'Webhook Settings' });

		new Setting(containerEl)
			.setName('Enable Webhooks')
			.setDesc('Trigger webhooks after successful uploads')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.webhookEnabled || false)
				.onChange(async (value) => {
					this.plugin.settings.webhookEnabled = value;
					await this.plugin.saveSettings();
					// Refresh the display to show/hide webhook URL field
					this.display();
				}));

		if (this.plugin.settings.webhookEnabled) {
			new Setting(containerEl)
				.setName('Webhook URL')
				.setDesc('URL to POST webhook data to after successful uploads')
				.addText(text => text
					.setPlaceholder('https://your-site.com/webhook')
					.setValue(this.plugin.settings.webhookUrl || '')
					.onChange(async (value) => {
						this.plugin.settings.webhookUrl = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Webhook Headers')
				.setDesc('Custom headers to send with webhook (JSON format, e.g., {"Authorization": "Bearer token"})')
				.addTextArea(text => {
					const headersJson = JSON.stringify(this.plugin.settings.webhookHeaders || {}, null, 2);
					return text
						.setPlaceholder('{\n  "Authorization": "Bearer your-token",\n  "X-Custom-Header": "value"\n}')
						.setValue(headersJson)
						.onChange(async (value) => {
							try {
								const headers = value.trim() ? JSON.parse(value) : {};
								this.plugin.settings.webhookHeaders = headers;
								await this.plugin.saveSettings();
							} catch (error) {
								console.error('Invalid JSON in webhook headers:', error);
							}
						});
				});

			// Test webhook button
			const webhookTestContainer = containerEl.createDiv('craft-button-container');
			const testWebhookBtn = webhookTestContainer.createEl('button', {
				text: '🪝 Test Webhook',
				cls: 'mod-secondary'
			});

			testWebhookBtn.addEventListener('click', async () => {
				await this.testWebhook(testWebhookBtn);
			});
		}
	}

	private async testWebhook(button: HTMLButtonElement) {
		if (!this.plugin.settings.webhookUrl) {
			new Notice('Please configure webhook URL first');
			return;
		}

		button.disabled = true;
		button.textContent = '🔄 Testing...';

		try {
			// Import requestUrl at the top of the file if not already imported
			const { requestUrl } = require('obsidian');
			
			// Create test payload
			const testPayload = {
				event: 'webhook_test',
				timestamp: new Date().toISOString(),
				source: 'obsidian-plugin',
				message: 'This is a test webhook from Obsidian Craft CMS Plugin'
			};

			const response = await requestUrl({
				url: this.plugin.settings.webhookUrl,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'Obsidian-Craft-CMS-Plugin/1.0',
					...(this.plugin.settings.webhookHeaders || {})
				},
				body: JSON.stringify(testPayload)
			});

			if (response.status >= 200 && response.status < 300) {
				new Notice(`✅ Webhook test successful! (${response.status})`);
			} else {
				new Notice(`⚠️ Webhook returned status ${response.status}`);
			}

		} catch (error) {
			console.error('Webhook test failed:', error);
			new Notice(`❌ Webhook test failed: ${error.message}`);
		} finally {
			button.disabled = false;
			button.textContent = '🪝 Test Webhook';
		}

		// Also update connection status
		const statusEl = document.querySelector('.craft-connection-status') as HTMLElement;
		if (statusEl) this.updateConnectionStatus(statusEl);
	}


	private addTestButton(containerEl: HTMLElement) {
		const buttonContainer = containerEl.createDiv('craft-button-container');
		
		const testBtn = buttonContainer.createEl('button', {
			text: '🧪 Test Connection',
			cls: 'mod-cta'
		});

		testBtn.addEventListener('click', async () => {
			testBtn.disabled = true;
			testBtn.textContent = '🔄 Testing...';
			
			try {
				await this.plugin.testConnection();
				// Update the status display
				const statusEl = containerEl.querySelector('.craft-connection-status') as HTMLElement;
				if (statusEl) this.updateConnectionStatus(statusEl);
			} finally {
				testBtn.disabled = false;
				testBtn.textContent = '🧪 Test Connection';
			}
		});

		const schemaBtn = buttonContainer.createEl('button', {
			text: '🔍 Analyze Schema',
			cls: 'mod-secondary'
		});

		schemaBtn.addEventListener('click', () => {
			import('../ui/schemaModal').then(({ SchemaAnalysisModal }) => {
				new SchemaAnalysisModal(this.app, this.plugin).open();
			});
		});

		// Add some CSS for better styling (enhanced with datetime info styling)
		this.addSettingsCSS();
	}

	private addSettingsCSS() {
		if (!document.querySelector('#craft-settings-css')) {
			const style = document.createElement('style');
			style.id = 'craft-settings-css';
			style.textContent = `
				.craft-status-container {
					margin-bottom: 2rem;
					padding: 1rem;
					background: var(--background-secondary);
					border-radius: 6px;
				}

				.craft-connection-status > div {
					display: flex;
					align-items: center;
					gap: 8px;
					padding: 8px 12px;
					border-radius: 4px;
					font-weight: 500;
				}

				.craft-status-success {
					background: rgba(34, 197, 94, 0.1);
					color: var(--text-success);
					border: 1px solid rgba(34, 197, 94, 0.2);
				}

				.craft-status-error {
					background: rgba(239, 68, 68, 0.1);  
					color: var(--text-error);
					border: 1px solid rgba(239, 68, 68, 0.2);
				}

				.craft-status-checking {
					background: rgba(59, 130, 246, 0.1);
					color: var(--text-accent);
					border: 1px solid rgba(59, 130, 246, 0.2);
				}

				.craft-button-container {
					margin-top: 2rem;
					padding-top: 1rem;
					border-top: 1px solid var(--background-modifier-border);
					display: flex;
					gap: 12px;
				}

				.craft-button-container button:disabled {
					opacity: 0.6;
					cursor: not-allowed;
				}

				.timezone-info {
					margin-top: 8px;
				}

				.timezone-info strong {
					color: var(--text-normal);
				}
			`;
			document.head.appendChild(style);
		}
	}
}