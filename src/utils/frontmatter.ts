import { parseYaml } from 'obsidian';

export interface ParsedContent {
	frontmatter: any;
	body: string;
}

export function parseFrontmatter(content: string): ParsedContent {
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

export function addToFrontmatter(content: string, data: Record<string, any>): string {
	const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
	const match = content.match(frontmatterRegex);

	if (match) {
		let yamlContent = match[1];
		const bodyContent = match[2];

		// Add new fields to frontmatter
		Object.entries(data).forEach(([key, value]) => {
			if (!yamlContent.includes(`${key}:`)) {
				const yamlValue = typeof value === 'string' ? `"${value}"` : value;
				yamlContent += `\n${key}: ${yamlValue}`;
			}
		});

		return `---\n${yamlContent}\n---\n${bodyContent}`;
	} else {
		// No existing frontmatter, create it
		const yamlEntries = Object.entries(data)
			.map(([key, value]) => {
				const yamlValue = typeof value === 'string' ? `"${value}"` : value;
				return `${key}: ${yamlValue}`;
			})
			.join('\n');

		return `---\n${yamlEntries}\n---\n\n${content}`;
	}
}

export function updateFrontmatter(content: string, updates: Record<string, any>): string {
	const { frontmatter, body } = parseFrontmatter(content);
	
	// Merge updates into existing frontmatter
	const updatedFrontmatter = { ...frontmatter, ...updates };
	
	// Convert back to YAML string
	const yamlEntries = Object.entries(updatedFrontmatter)
		.map(([key, value]) => {
			if (typeof value === 'string') {
				return `${key}: "${value}"`;
			} else if (Array.isArray(value)) {
				return `${key}:\n${value.map(v => `  - ${v}`).join('\n')}`;
			} else {
				return `${key}: ${value}`;
			}
		})
		.join('\n');

	return `---\n${yamlEntries}\n---\n\n${body}`;
}