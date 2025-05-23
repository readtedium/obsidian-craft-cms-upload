import { CraftAPI } from './craftAPI';

export interface CraftField {
	name: string;
	type: string;
	kind: string;
	required: boolean;
	description?: string;
	isCustomField: boolean;
}

export interface CraftContentType {
	handle: string;
	name: string;
	fields: CraftField[];
	mutationName: string;
}

export interface CraftSection {
	handle: string;
	name: string;
	entryTypes: CraftContentType[];
}

export class SchemaIntrospector {
	private schema: any = null;
	private contentTypes: Map<string, CraftContentType> = new Map();

	constructor(private api: CraftAPI) {}

	/**
	 * Analyze Craft's GraphQL schema to discover content types and fields
	 */
	async analyzeSchema(): Promise<CraftSection[]> {
		console.log('🔍 Starting schema introspection...');
		
		try {
			this.schema = await this.api.introspectSchema();
			
			if (!this.schema) {
				throw new Error('Failed to retrieve schema');
			}

			console.log('📊 Schema retrieved, analyzing types...');
			
			// Find all entry types (they end with _Entry)
			const entryTypes = this.findEntryTypes();
			console.log(`🎯 Found ${entryTypes.length} entry types:`, entryTypes.map(t => t.name));

			// Analyze each entry type to extract fields
			const contentTypes = await this.analyzeEntryTypes(entryTypes);
			
			// Group by sections (this is a simplified approach)
			const sections = this.groupBySection(contentTypes);
			
			console.log('✅ Schema analysis complete!');
			return sections;

		} catch (error) {
			console.error('💥 Schema analysis failed:', error);
			throw error;
		}
	}

	/**
	 * Get available content types for a specific section
	 */
	getContentTypesForSection(sectionHandle: string): CraftContentType[] {
		const results: CraftContentType[] = [];
		
		this.contentTypes.forEach((contentType, key) => {
			// Match section handle in the content type name
			if (key.includes(sectionHandle)) {
				results.push(contentType);
			}
		});

		return results;
	}

	/**
	 * Find all GraphQL types that represent Craft entries
	 */
	private findEntryTypes(): any[] {
		if (!this.schema?.types) return [];

		return this.schema.types.filter((type: any) => {
			// Craft entry types end with "_Entry"
			return type.name?.endsWith('_Entry') && 
				   type.kind === 'OBJECT' && 
				   type.fields?.length > 0;
		});
	}

	/**
	 * Analyze each entry type to extract field information
	 */
	private async analyzeEntryTypes(entryTypes: any[]): Promise<CraftContentType[]> {
		const contentTypes: CraftContentType[] = [];

		for (const entryType of entryTypes) {
			try {
				const contentType = this.analyzeEntryType(entryType);
				if (contentType && contentType.fields.length > 0) {
					contentTypes.push(contentType);
					this.contentTypes.set(entryType.name, contentType);
					console.log(`✅ Successfully analyzed ${entryType.name} with ${contentType.fields.length} fields`);
				} else {
					console.log(`ℹ️ Skipping ${entryType.name} - no usable fields found`);
				}
			} catch (error) {
				console.warn(`⚠️ Failed to analyze entry type ${entryType.name}:`, error);
			}
		}

		return contentTypes;
	}

	/**
	 * Analyze a single entry type to extract its fields
	 */
	private analyzeEntryType(entryType: any): CraftContentType | null {
		if (!entryType.fields) return null;

		console.log(`🔬 Analyzing entry type: ${entryType.name}`);

		const fields: CraftField[] = [];

		// Standard Craft fields we always expect
		const standardFields = ['id', 'title', 'slug', 'uri', 'enabled', 'dateCreated', 'dateUpdated'];

		for (const field of entryType.fields) {
			const craftField = this.analyzeField(field, standardFields);
			if (craftField) {
				fields.push(craftField);
			}
		}

		// Only return content types that have at least some fields
		if (fields.length === 0) {
			console.log(`⚠️ Entry type ${entryType.name} has no usable fields`);
			return null;
		}

		// Extract section and entry type from the GraphQL type name
		// Format is usually like "posts_posts_Entry" or "articles_Entry"
		const nameParts = entryType.name.replace('_Entry', '').split('_');
		const handle = nameParts.join('_');
		const mutationName = `save_${handle}_Entry`;

		return {
			handle,
			name: this.humanizeName(handle),
			fields,
			mutationName
		};
	}

	/**
	 * Analyze a single field to determine its type and properties
	 */
	private analyzeField(field: any, standardFields: string[]): CraftField | null {
		if (!field.name || !field.type) return null;

		try {
			const isCustomField = !standardFields.includes(field.name);
			const fieldType = this.getFieldType(field.type);
			
			// Skip some system fields that aren't useful for content creation
			const skipFields = ['dateCreated', 'dateUpdated', 'uri', '__typename', 'uid'];
			if (skipFields.includes(field.name)) return null;

			return {
				name: field.name,
				type: fieldType.type,
				kind: fieldType.kind,
				required: fieldType.required,
				isCustomField,
				description: field.description
			};
		} catch (error) {
			console.warn(`⚠️ Failed to analyze field ${field.name}:`, error);
			return null;
		}
	}

	/**
	 * Extract type information from GraphQL type objects
	 */
	private getFieldType(typeObj: any): { type: string; kind: string; required: boolean } {
		if (!typeObj) {
			return { type: 'Unknown', kind: 'SCALAR', required: false };
		}

		let current = typeObj;
		let required = false;

		try {
			// Unwrap NON_NULL types
			if (current?.kind === 'NON_NULL') {
				required = true;
				current = current.ofType;
			}

			// Unwrap LIST types
			if (current?.kind === 'LIST') {
				current = current.ofType;
				if (current?.kind === 'NON_NULL') {
					current = current.ofType;
				}
			}

			// Safety check for final type
			if (!current) {
				return { type: 'Unknown', kind: 'SCALAR', required };
			}

			return {
				type: current.name || 'Unknown',
				kind: current.kind || 'SCALAR',
				required
			};
		} catch (error) {
			console.warn('⚠️ Error parsing field type:', error, 'for type object:', typeObj);
			return { type: 'Unknown', kind: 'SCALAR', required: false };
		}
	}

	/**
	 * Group content types by their section
	 */
	private groupBySection(contentTypes: CraftContentType[]): CraftSection[] {
		const sectionMap = new Map<string, CraftContentType[]>();

		for (const contentType of contentTypes) {
			// Extract section handle from content type handle
			// This is a simplified approach - in reality, you might need to query Craft's API
			const sectionHandle = contentType.handle.split('_')[0];
			
			if (!sectionMap.has(sectionHandle)) {
				sectionMap.set(sectionHandle, []);
			}
			sectionMap.get(sectionHandle)!.push(contentType);
		}

		const sections: CraftSection[] = [];
		sectionMap.forEach((entryTypes, handle) => {
			sections.push({
				handle,
				name: this.humanizeName(handle),
				entryTypes
			});
		});

		return sections;
	}

	/**
	 * Convert handle names to human-readable format
	 */
	private humanizeName(handle: string): string {
		return handle
			.split('_')
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	/**
	 * Generate dynamic form fields based on content type
	 */
	generateFormFields(contentType: CraftContentType): FormFieldDefinition[] {
		const formFields: FormFieldDefinition[] = [];

		for (const field of contentType.fields) {
			const formField = this.mapFieldToFormInput(field);
			if (formField) {
				formFields.push(formField);
			}
		}

		return formFields;
	}

	/**
	 * Map Craft field types to form input types
	 */
	private mapFieldToFormInput(field: CraftField): FormFieldDefinition | null {
		// Skip system fields for form generation
		if (['id', 'dateCreated', 'dateUpdated'].includes(field.name)) {
			return null;
		}

		let inputType: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date' = 'text';
		let placeholder = '';

		// Map GraphQL types to form inputs
		switch (field.type) {
			case 'String':
				inputType = field.name.includes('body') || field.name.includes('content') ? 'textarea' : 'text';
				placeholder = `Enter ${field.name}`;
				break;
			case 'Boolean':
				inputType = 'checkbox';
				break;
			case 'Int':
			case 'Float':
				inputType = 'number';
				placeholder = `Enter ${field.name}`;
				break;
			case 'DateTime':
				inputType = 'date';
				break;
			default:
				inputType = 'text';
				placeholder = `Enter ${field.name}`;
		}

		return {
			name: field.name,
			label: this.humanizeName(field.name),
			type: inputType,
			required: field.required,
			placeholder,
			description: field.description
		};
	}

	/**
	 * Get the current cached schema
	 */
	getCachedSchema(): any {
		return this.schema;
	}

	/**
	 * Clear the cached schema (force re-analysis)
	 */
	clearCache(): void {
		this.schema = null;
		this.contentTypes.clear();
	}
}

export interface FormFieldDefinition {
	name: string;
	label: string;
	type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date';
	required: boolean;
	placeholder?: string;
	description?: string;
	options?: { value: string; label: string }[];
}