import { Notice } from 'obsidian';
import { CraftAPI } from './craftAPI';
import { SchemaIntrospector, CraftSection, CraftContentType, FormFieldDefinition } from './schemaIntrospector';

export class SchemaManager {
	private introspector: SchemaIntrospector;
	private cachedSections: CraftSection[] = [];
	private lastAnalysis: number = 0;
	private cacheTimeout = 5 * 60 * 1000; // 5 minutes

	constructor(private api: CraftAPI) {
		this.introspector = new SchemaIntrospector(api);
	}

	/**
	 * NEW: Expose the introspector for direct access to validation methods
	 */
	get schemaIntrospector(): SchemaIntrospector {
		return this.introspector;
	}

	/**
	 * Get analyzed schema sections (with caching)
	 */
	async getSections(forceRefresh = false): Promise<CraftSection[]> {
		const now = Date.now();
		const isCacheValid = this.cachedSections.length > 0 && 
						   (now - this.lastAnalysis) < this.cacheTimeout;

		if (!forceRefresh && isCacheValid) {
			console.log('📋 Using cached schema data');
			return this.cachedSections;
		}

		try {
			console.log('🔄 Refreshing schema analysis...');
			new Notice('Analyzing Craft CMS schema...');
			
			this.cachedSections = await this.introspector.analyzeSchema();
			this.lastAnalysis = now;
			
			// Log fields with character limits found
			const sectionsWithLimits = this.cachedSections.filter(section => 
				section.entryTypes.some(contentType => 
					this.introspector.hasCharacterLimits(contentType)
				)
			);
			
			if (sectionsWithLimits.length > 0) {
				console.log('📏 Sections with character limits detected:', sectionsWithLimits.map(s => s.name));
			}
			
			new Notice(`✅ Found ${this.cachedSections.length} content sections`);
			return this.cachedSections;

		} catch (error) {
			console.error('💥 Schema analysis failed:', error);
			new Notice(`Schema analysis failed: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get content types for a specific section
	 */
	async getContentTypesForSection(sectionHandle: string): Promise<CraftContentType[]> {
		const sections = await this.getSections();
		const section = sections.find(s => s.handle === sectionHandle);
		return section?.entryTypes || [];
	}

	/**
	 * Get a specific content type by handle
	 */
	async getContentType(handle: string): Promise<CraftContentType | null> {
		const sections = await this.getSections();
		
		for (const section of sections) {
			const contentType = section.entryTypes.find(ct => ct.handle === handle);
			if (contentType) return contentType;
		}

		return null;
	}

	/**
	 * Generate form fields for a content type
	 */
	async getFormFields(contentTypeHandle: string): Promise<FormFieldDefinition[]> {
		const contentType = await this.getContentType(contentTypeHandle);
		
		if (!contentType) {
			throw new Error(`Content type '${contentTypeHandle}' not found`);
		}

		return this.introspector.generateFormFields(contentType);
	}

	/**
	 * Get available sections for selection
	 */
	async getAvailableSections(): Promise<Array<{ handle: string; name: string; entryCount: number }>> {
		const sections = await this.getSections();
		
		return sections.map(section => ({
			handle: section.handle,
			name: section.name,
			entryCount: section.entryTypes.length
		}));
	}

	/**
	 * Enhanced schema summary including character limit information
	 */
	async getSchemaSummary(): Promise<SchemaSummary> {
		const sections = await this.getSections();
		
		let totalContentTypes = 0;
		let totalFields = 0;
		let customFields = 0;
		let fieldsWithLimits = 0;

		for (const section of sections) {
			totalContentTypes += section.entryTypes.length;
			
			for (const contentType of section.entryTypes) {
				totalFields += contentType.fields.length;
				customFields += contentType.fields.filter(f => f.isCustomField).length;
				fieldsWithLimits += contentType.fields.filter(f => f.characterLimit !== undefined).length;
			}
		}

		return {
			sectionsCount: sections.length,
			contentTypesCount: totalContentTypes,
			totalFieldsCount: totalFields,
			customFieldsCount: customFields,
			fieldsWithLimitsCount: fieldsWithLimits, // NEW
			lastAnalysis: new Date(this.lastAnalysis),
			sections: sections.map(s => ({
				handle: s.handle,
				name: s.name,
				entryTypes: s.entryTypes.map(et => ({
					handle: et.handle,
					name: et.name,
					fieldsCount: et.fields.length,
					fieldsWithLimitsCount: et.fields.filter(f => f.characterLimit !== undefined).length // NEW
				}))
			}))
		};
	}

	/**
	 * Enhanced validation with character limit checks
	 */
	async validateContentTypeForUpload(contentTypeHandle: string): Promise<ValidationResult> {
		const contentType = await this.getContentType(contentTypeHandle);
		
		if (!contentType) {
			return {
				valid: false,
				errors: [`Content type '${contentTypeHandle}' not found`]
			};
		}

		const errors: string[] = [];
		const warnings: string[] = [];

		// Check for essential fields
		const hasTitle = contentType.fields.some(f => f.name === 'title');
		const hasBody = contentType.fields.some(f => f.name.includes('body') || f.name.includes('content'));

		if (!hasTitle) {
			errors.push('Content type is missing a title field');
		}

		if (!hasBody) {
			warnings.push('Content type appears to be missing a body/content field');
		}

		// Check for slug field
		const hasSlug = contentType.fields.some(f => f.name === 'slug');
		if (!hasSlug) {
			warnings.push('Content type is missing a slug field - URLs may not work as expected');
		}

		// NEW: Check for fields with character limits and prepare the array correctly
		const fieldsWithLimits = this.introspector.getFieldsWithLimits(contentType)
			.filter(field => field.characterLimit !== undefined) // Filter out undefined values
			.map(field => ({
				name: field.name,
				characterLimit: field.characterLimit! // Non-null assertion since we filtered above
			}));

		if (fieldsWithLimits.length > 0) {
			console.log(`📏 Content type ${contentType.name} has ${fieldsWithLimits.length} fields with character limits:`,
				fieldsWithLimits.map(f => `${f.name}: ${f.characterLimit} chars`));
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			contentType,
			fieldsWithLimits // Now correctly typed
		};
	}

	/**
	 * NEW: Validate field values against character limits
	 */
	validateFieldValues(contentTypeHandle: string, fieldValues: Record<string, string>): Promise<FieldValidationResults> {
		return new Promise(async (resolve) => {
			const contentType = await this.getContentType(contentTypeHandle);
			
			if (!contentType) {
				resolve({
					valid: false,
					fieldResults: {},
					globalErrors: [`Content type '${contentTypeHandle}' not found`]
				});
				return;
			}

			const fieldResults: Record<string, any> = {};
			let hasErrors = false;

			// Validate each field value
			for (const [fieldName, value] of Object.entries(fieldValues)) {
				const field = contentType.fields.find(f => f.name === fieldName);
				const result = this.introspector.validateFieldValue(fieldName, value, field);
				
				fieldResults[fieldName] = result;
				if (!result.valid) {
					hasErrors = true;
				}
			}

			resolve({
				valid: !hasErrors,
				fieldResults,
				globalErrors: []
			});
		});
	}

	/**
	 * NEW: Get character limit for a specific field
	 */
	async getCharacterLimit(contentTypeHandle: string, fieldName: string): Promise<number | null> {
		const contentType = await this.getContentType(contentTypeHandle);
		if (!contentType) return null;

		const field = contentType.fields.find(f => f.name === fieldName);
		return field?.characterLimit || null;
	}

	/**
	 * Clear all cached data
	 */
	clearCache(): void {
		this.cachedSections = [];
		this.lastAnalysis = 0;
		this.introspector.clearCache();
		console.log('🧹 Schema cache cleared');
	}

	/**
	 * Get cache status
	 */
	getCacheStatus(): { 
		isCached: boolean; 
		lastAnalysis: Date | null; 
		sectionsCount: number;
		minutesOld: number;
	} {
		const now = Date.now();
		const minutesOld = this.lastAnalysis > 0 ? Math.floor((now - this.lastAnalysis) / 60000) : 0;

		return {
			isCached: this.cachedSections.length > 0,
			lastAnalysis: this.lastAnalysis > 0 ? new Date(this.lastAnalysis) : null,
			sectionsCount: this.cachedSections.length,
			minutesOld
		};
	}
}

export interface SchemaSummary {
	sectionsCount: number;
	contentTypesCount: number;
	totalFieldsCount: number;
	customFieldsCount: number;
	fieldsWithLimitsCount: number; // NEW
	lastAnalysis: Date;
	sections: Array<{
		handle: string;
		name: string;
		entryTypes: Array<{
			handle: string;
			name: string;
			fieldsCount: number;
			fieldsWithLimitsCount: number; // NEW
		}>;
	}>;
}

// Fixed ValidationResult interface
export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings?: string[];
	contentType?: CraftContentType;
	fieldsWithLimits?: Array<{ name: string; characterLimit: number }>; // Fixed: now requires characterLimit to be number
}

// NEW: Field validation results interface
export interface FieldValidationResults {
	valid: boolean;
	fieldResults: Record<string, {
		valid: boolean;
		errors: string[];
		warnings: string[];
		characterCount?: number;
		remainingCharacters?: number;
	}>;
	globalErrors: string[];
}