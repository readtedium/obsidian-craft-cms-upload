// src/utils/fieldLimits.ts - Simple field limits utility

export interface FieldLimits {
	[fieldName: string]: number;
}

export class FieldLimitsManager {
	constructor(private fieldLimits: FieldLimits) {}

	/**
	 * Get character limit for a field
	 */
	getLimit(fieldName: string): number | null {
		return this.fieldLimits[fieldName] || null;
	}

	/**
	 * Check if field has a character limit
	 */
	hasLimit(fieldName: string): boolean {
		return fieldName in this.fieldLimits;
	}

	/**
	 * Validate field value against its limit
	 */
	validateField(fieldName: string, value: string): {
		valid: boolean;
		characterCount: number;
		limit: number | null;
		remaining: number | null;
		errors: string[];
		warnings: string[];
	} {
		const limit = this.getLimit(fieldName);
		const characterCount = value?.length || 0;
		
		if (!limit) {
			return {
				valid: true,
				characterCount,
				limit: null,
				remaining: null,
				errors: [],
				warnings: []
			};
		}

		const remaining = limit - characterCount;
		const errors: string[] = [];
		const warnings: string[] = [];

		if (characterCount > limit) {
			errors.push(`Exceeds limit by ${characterCount - limit} characters`);
		} else if (characterCount > limit * 0.9) {
			warnings.push(`Approaching character limit`);
		}

		return {
			valid: errors.length === 0,
			characterCount,
			limit,
			remaining,
			errors,
			warnings
		};
	}

	/**
	 * Get all fields with limits
	 */
	getFieldsWithLimits(): Array<{ fieldName: string; limit: number }> {
		return Object.entries(this.fieldLimits).map(([fieldName, limit]) => ({
			fieldName,
			limit
		}));
	}

	/**
	 * Update field limits
	 */
	updateLimits(newLimits: FieldLimits): void {
		this.fieldLimits = { ...newLimits };
	}
}