import { CraftAPI } from './craftAPI';

export interface CraftField {
	name: string;
	type: string;
	kind: string;
	required: boolean;
	description?: string;
	isCustomField: boolean;
	// NEW: Character limit properties
	maxLength?: number;
	minLength?: number;
	characterLimit?: number; // Unified property for any length constraint
	validationRules?: {
		maxLength?: number;
		minLength?: number;
		pattern?: string;
		required?: boolean;
	};
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
	// NEW: Cache for field constraints
	private fieldConstraints: Map<string, any> = new Map();

	constructor(private api: CraftAPI) {}

	/**
	 * Analyze Craft's GraphQL schema to discover content types and fields with constraints
	 */
	async analyzeSchema(): Promise<CraftSection[]> {
		console.log('🔍 Starting enhanced schema introspection...');
		
		try {
			this.schema = await this.api.introspectSchema();
			
			if (!this.schema) {
				throw new Error('Failed to retrieve schema');
			}

			console.log('📊 Schema retrieved, analyzing types and constraints...');
			
			// Find all entry types (they end with _Entry)
			const entryTypes = this.findEntryTypes();
			console.log(`🎯 Found ${entryTypes.length} entry types:`, entryTypes.map(t => t.name));

			// NEW: Analyze field constraints and character limits
			await this.analyzeFieldConstraints();

			// Analyze each entry type to extract fields with their constraints
			const contentTypes = await this.analyzeEntryTypes(entryTypes);
			
			// Group by sections
			const sections = this.groupBySection(contentTypes);
			
			console.log('✅ Enhanced schema analysis complete!');
			return sections;

		} catch (error) {
			console.error('💥 Schema analysis failed:', error);
			throw error;
		}
	}

	/**
	 * NEW: Analyze field constraints including character limits
	 */
	private async analyzeFieldConstraints(): Promise<void> {
		console.log('🔍 Analyzing field constraints...');
		
		if (!this.schema?.types) return;

		// Look for input types that might contain validation info
		const inputTypes = this.schema.types.filter((type: any) => 
			type.kind === 'INPUT_OBJECT' && type.name.includes('Input')
		);

		// Also check for any custom scalar types that might have constraints
		const scalarTypes = this.schema.types.filter((type: any) => 
			type.kind === 'SCALAR'
		);

		// Look for directives that might indicate constraints
		if (this.schema.directives) {
			const constraintDirectives = this.schema.directives.filter((dir: any) => 
				dir.name.toLowerCase().includes('constraint') ||
				dir.name.toLowerCase().includes('length') ||
				dir.name.toLowerCase().includes('validate')
			);
			
			console.log('📏 Found constraint directives:', constraintDirectives.map((d: any) => d.name));
		}

		// Store common field patterns and their likely limits
		this.fieldConstraints.set('metaDescription', { maxLength: 160 }); // Standard SEO limit
		this.fieldConstraints.set('metaHeadline', { maxLength: 60 });     // Standard SEO title limit
		this.fieldConstraints.set('shortDeck', { maxLength: 140 });       // Twitter-style limit
		this.fieldConstraints.set('deck', { maxLength: 300 });            // Longer description limit
		
		console.log('📏 Initialized field constraints cache');
	}

	/**
	 * Enhanced field analysis with character limit detection
	 */
	private analyzeField(field: any, standardFields: string[]): CraftField | null {
		if (!field.name || !field.type) return null;

		try {
			const isCustomField = !standardFields.includes(field.name);
			const fieldType = this.getFieldType(field.type);
			
			// Skip some system fields that aren't useful for content creation
			const skipFields = ['dateCreated', 'dateUpdated', 'uri', '__typename', 'uid'];
			if (skipFields.includes(field.name)) return null;

			// NEW: Detect character limits for this field
			const characterLimits = this.detectCharacterLimits(field);

			const craftField: CraftField = {
				name: field.name,
				type: fieldType.type,
				kind: fieldType.kind,
				required: fieldType.required,
				isCustomField,
				description: field.description,
				// NEW: Add character limit properties
				...characterLimits
			};

			// Log fields with detected limits
			if (craftField.characterLimit) {
				console.log(`📏 Detected character limit for ${field.name}: ${craftField.characterLimit} characters`);
			}

			return craftField;
		} catch (error) {
			console.warn(`⚠️ Failed to analyze field ${field.name}:`, error);
			return null;
		}
	}

	/**
	 * NEW: Detect character limits for a specific field
	 */
	private detectCharacterLimits(field: any): Partial<CraftField> {
		const limits: Partial<CraftField> = {};
		
		// Check our predefined constraints
		const knownConstraints = this.fieldConstraints.get(field.name);
		if (knownConstraints) {
			limits.characterLimit = knownConstraints.maxLength;
			limits.maxLength = knownConstraints.maxLength;
			limits.minLength = knownConstraints.minLength;
		}

		// Try to extract limits from field description
		if (field.description) {
			const limitMatches = field.description.match(/(?:max|limit|maximum).*?(\d+).*?(?:char|character)/i);
			if (limitMatches) {
				const extractedLimit = parseInt(limitMatches[1]);
				limits.characterLimit = extractedLimit;
				limits.maxLength = extractedLimit;
				console.log(`📏 Extracted limit from description for ${field.name}: ${extractedLimit}`);
			}
		}

		// Check for common field name patterns and apply sensible defaults
		if (!limits.characterLimit) {
			const fieldNameLower = field.name.toLowerCase();
			
			if (fieldNameLower.includes('meta') && fieldNameLower.includes('description')) {
				limits.characterLimit = 160; // SEO meta description standard
			} else if (fieldNameLower.includes('meta') && (fieldNameLower.includes('title') || fieldNameLower.includes('headline'))) {
				limits.characterLimit = 60;  // SEO title standard
			} else if (fieldNameLower === 'title') {
				limits.characterLimit = 100; // Reasonable title limit
			} else if (fieldNameLower.includes('short') && fieldNameLower.includes('deck')) {
				limits.characterLimit = 140; // Twitter-style limit
			} else if (fieldNameLower === 'deck' || fieldNameLower.includes('subtitle')) {
				limits.characterLimit = 300; // Subtitle/deck limit
			} else if (fieldNameLower.includes('slug')) {
				limits.characterLimit = 50;  // URL slug limit
			}
		}

		// Set validation rules if we have limits
		if (limits.characterLimit) {
			limits.validationRules = {
				maxLength: limits.characterLimit,
				minLength: limits.minLength,
				required: field.type?.kind === 'NON_NULL'
			};
		}

		return limits;
	}

	/**
	 * Get field constraints for validation
	 */
	getFieldConstraints(fieldName: string): CraftField['validationRules'] | null {
		// Check if we have specific constraints for this field
		const knownConstraints = this.fieldConstraints.get(fieldName);
		if (knownConstraints) {
			return knownConstraints;
		}

		// Return null if no constraints found
		return null;
	}

	/**
	 * Validate field value against constraints
	 */
	validateFieldValue(fieldName: string, value: string, field?: CraftField): {
		valid: boolean;
		errors: string[];
		warnings: string[];
		characterCount?: number;
		remainingCharacters?: number;
	} {
		const result = {
			valid: true,
			errors: [] as string[],
			warnings: [] as string[],
			characterCount: value?.length || 0,
			remainingCharacters: undefined as number | undefined
		};

		if (!value && !field?.required) {
			return result;
		}

		const constraints = field?.validationRules || this.getFieldConstraints(fieldName);
		
		if (!constraints) {
			return result;
		}

		// Check required
		if (constraints.required && (!value || value.trim().length === 0)) {
			result.valid = false;
			result.errors.push(`${fieldName} is required`);
		}

		if (value) {
			const length = value.length;
			result.characterCount = length;

			// Check max length
			if (constraints.maxLength) {
				result.remainingCharacters = constraints.maxLength - length;
				
				if (length > constraints.maxLength) {
					result.valid = false;
					result.errors.push(`${fieldName} exceeds maximum length of ${constraints.maxLength} characters (currently ${length})`);
				} else if (length > constraints.maxLength * 0.9) {
					// Warning when approaching limit
					result.warnings.push(`${fieldName} is approaching character limit (${length}/${constraints.maxLength})`);
				}
			}

			// Check min length
			if (constraints.minLength && length < constraints.minLength) {
				result.valid = false;
				result.errors.push(`${fieldName} must be at least ${constraints.minLength} characters (currently ${length})`);
			}

			// Check pattern if provided
			if (constraints.pattern) {
				const regex = new RegExp(constraints.pattern);
				if (!regex.test(value)) {
					result.valid = false;
					result.errors.push(`${fieldName} format is invalid`);
				}
			}
		}

		return result;
	}

	/**
	 * Get character limit for a specific field
	 */
	getCharacterLimit(fieldName: string): number | null {
		const constraints = this.fieldConstraints.get(fieldName);
		return constraints?.maxLength || null;
	}

	/**
	 * Check if content type has any fields with character limits
	 */
	hasCharacterLimits(contentType: CraftContentType): boolean {
		return contentType.fields.some(field => field.characterLimit !== undefined);
	}

	/**
	 * Get all fields with character limits for a content type
	 */
	getFieldsWithLimits(contentType: CraftContentType): CraftField[] {
		return contentType.fields.filter(field => field.characterLimit !== undefined);
	}

	// ... rest of the existing methods remain the same ...
	
	/**
	 * Find all GraphQL types that represent Craft entries
	 */
	private findEntryTypes(): any[] {
		if (!this.schema?.types) return [];

		return this.schema.types.filter((type: any) => {
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
					
					const fieldsWithLimits = this.getFieldsWithLimits(contentType);
					console.log(`✅ Successfully analyzed ${entryType.name} with ${contentType.fields.length} fields (${fieldsWithLimits.length} with character limits)`);
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
		const standardFields = ['id', 'title', 'slug', 'uri', 'enabled', 'dateCreated', 'dateUpdated'];

		for (const field of entryType.fields) {
			const craftField = this.analyzeField(field, standardFields);
			if (craftField) {
				fields.push(craftField);
			}
		}

		if (fields.length === 0) {
			console.log(`⚠️ Entry type ${entryType.name} has no usable fields`);
			return null;
		}

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
	 * Extract type information from GraphQL type objects
	 */
	private getFieldType(typeObj: any): { type: string; kind: string; required: boolean } {
		if (!typeObj) {
			return { type: 'Unknown', kind: 'SCALAR', required: false };
		}

		let current = typeObj;
		let required = false;

		try {
			if (current?.kind === 'NON_NULL') {
				required = true;
				current = current.ofType;
			}

			if (current?.kind === 'LIST') {
				current = current.ofType;
				if (current?.kind === 'NON_NULL') {
					current = current.ofType;
				}
			}

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
	 * Enhanced field mapping with character limit support
	 */
	private mapFieldToFormInput(field: CraftField): FormFieldDefinition | null {
		if (['id', 'dateCreated', 'dateUpdated'].includes(field.name)) {
			return null;
		}

		let inputType: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date' = 'text';
		let placeholder = '';

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

		// Enhanced placeholder with character limit info
		if (field.characterLimit && inputType !== 'checkbox') {
			placeholder += ` (max ${field.characterLimit} chars)`;
		}

		return {
			name: field.name,
			label: this.humanizeName(field.name),
			type: inputType,
			required: field.required,
			placeholder,
			description: field.description,
			// NEW: Include character limit information
			maxLength: field.characterLimit,
			validationRules: field.validationRules
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
		this.fieldConstraints.clear();
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
	// NEW: Character limit properties
	maxLength?: number;
	minLength?: number;
	validationRules?: {
		maxLength?: number;
		minLength?: number;
		pattern?: string;
		required?: boolean;
	};
}