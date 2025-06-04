// Update src/settings/settings.ts
import { CraftCMSSettings } from '../api/types';

export const DEFAULT_SETTINGS: CraftCMSSettings = {
	endpoint: 'https://your-site.com/index.php?action=graphql/api',
	token: '',
	sectionHandle: 'posts',
	authorId: '1',
	autoSavePostId: true,
	baseUrl: 'https://your-site.com',
	timezone: 'America/New_York',
	defaultPostTime: '09:00',
	dateFormat: 'iso',
	// Add webhook defaults
	webhookUrl: '',
	webhookEnabled: false,
	webhookHeaders: {}
};

export function validateSettings(settings: CraftCMSSettings): string[] {
	const errors: string[] = [];

	if (!settings.endpoint) {
		errors.push('GraphQL endpoint is required');
	}

	if (!settings.token) {
		errors.push('API token is required');
	}

	if (!settings.sectionHandle) {
		errors.push('Section handle is required');
	}

	if (!settings.authorId) {
		errors.push('Author ID is required');
	}

	// Validate URL format
	try {
		new URL(settings.endpoint);
	} catch {
		errors.push('GraphQL endpoint must be a valid URL');
	}

	if (settings.baseUrl) {
		try {
			new URL(settings.baseUrl);
		} catch {
			errors.push('Base URL must be a valid URL');
		}
	}

	// Validate webhook URL if enabled
	if (settings.webhookEnabled && settings.webhookUrl) {
		try {
			new URL(settings.webhookUrl);
		} catch {
			errors.push('Webhook URL must be a valid URL');
		}
	}

	return errors;
}

export function extractBaseUrl(endpoint: string): string {
	try {
		const url = new URL(endpoint);
		return `${url.protocol}//${url.host}`;
	} catch {
		return '';
	}
}