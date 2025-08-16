// src/utils/enhancedFormField.ts - Fixed version
import { FormFieldDefinition } from '../api/schemaIntrospector';

// Fixed validation result interface
interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
	characterCount?: number;
	remainingCharacters?: number;
}

/**
 * Enhanced form field renderer with character limit enforcement
 */
export function renderFormFieldWithLimits(
	container: HTMLElement,
	field: FormFieldDefinition,
	initialValue: string,
	onChange: (value: string, isValid: boolean) => void,
	validator?: (value: string) => ValidationResult
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
	const fieldContainer = container.createDiv('enhanced-form-field');
	
	// Add character limit class if applicable
	if (field.maxLength) {
		fieldContainer.addClass('has-character-limit');
	}

	// Field header with label and character counter
	const fieldHeader = fieldContainer.createDiv('field-header');
	const label = fieldHeader.createEl('label', { cls: 'field-label' });
	
	const labelContent = fieldHeader.createDiv('label-content');
	labelContent.innerHTML = `
		<span class="field-name">${field.label}</span>
		${field.required ? '<span class="required-indicator">*</span>' : ''}
	`;

	// Character counter (only show for text fields with limits)
	let characterCounter: HTMLElement | null = null;
	if (field.maxLength && field.type !== 'checkbox' && field.type !== 'select') {
		characterCounter = fieldHeader.createDiv('character-counter');
		updateCharacterCounter(characterCounter, 0, field.maxLength);
	}

	// Field description
	if (field.description) {
		fieldHeader.createEl('div', { 
			text: field.description, 
			cls: 'field-description' 
		});
	}

	// Input container
	const inputContainer = fieldContainer.createDiv('field-input-container');
	let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

	// Create the appropriate input type
	switch (field.type) {
		case 'textarea':
			input = inputContainer.createEl('textarea', { cls: 'field-input' });
			(input as HTMLTextAreaElement).rows = field.name === 'body' ? 8 : 4;
			break;
		case 'checkbox':
			const checkboxContainer = inputContainer.createDiv('checkbox-container');
			input = checkboxContainer.createEl('input', { type: 'checkbox', cls: 'field-checkbox' });
			const checkboxLabel = checkboxContainer.createSpan({ text: 'Enable', cls: 'checkbox-label' });
			checkboxContainer.appendChild(input);
			checkboxContainer.appendChild(checkboxLabel);
			break;
		case 'select':
			input = inputContainer.createEl('select', { cls: 'field-input' });
			if (field.options) {
				field.options.forEach(option => {
					const opt = (input as HTMLSelectElement).createEl('option');
					opt.value = option.value;
					opt.textContent = option.label;
				});
			}
			break;
		default:
			input = inputContainer.createEl('input', { 
				type: field.type, 
				cls: 'field-input'
			});
	}

	// Set placeholder and max length
	if (field.placeholder && field.type !== 'select' && field.type !== 'checkbox') {
		(input as HTMLInputElement | HTMLTextAreaElement).placeholder = field.placeholder;
	}

	if (field.maxLength && field.type !== 'checkbox' && field.type !== 'select') {
		input.setAttribute('maxlength', field.maxLength.toString());
	}

	// Validation message container
	const validationContainer = inputContainer.createDiv('validation-messages');

	// Set initial value
	if (initialValue !== undefined) {
		if (field.type === 'checkbox') {
			(input as HTMLInputElement).checked = Boolean(initialValue);
		} else {
			input.value = String(initialValue);
		}
	}

	// Real-time validation and character counting
	const validateAndUpdate = () => {
		const currentValue = field.type === 'checkbox' 
			? String((input as HTMLInputElement).checked)
			: input.value;

		// Fixed: Create proper validation result with explicit types
		let validationResult: ValidationResult;
		
		if (validator && field.type !== 'checkbox') {
			validationResult = validator(currentValue);
		} else {
			// Initialize with explicit types to avoid TypeScript inference issues
			validationResult = { 
				valid: true, 
				errors: [] as string[], 
				warnings: [] as string[], 
				characterCount: 0, 
				remainingCharacters: undefined as number | undefined
			};

			if (field.maxLength && field.type !== 'checkbox') {
				// Simple built-in validation
				const length = currentValue.length;
				validationResult.characterCount = length;
				validationResult.remainingCharacters = field.maxLength - length;
				
				if (length > field.maxLength) {
					validationResult.valid = false;
					validationResult.errors.push(`Exceeds maximum length of ${field.maxLength} characters`);
				} else if (length > field.maxLength * 0.9) {
					validationResult.warnings.push(`Approaching character limit`);
				}

				if (field.required && length === 0) {
					validationResult.valid = false;
					validationResult.errors.push(`${field.label} is required`);
				}
			}
		}

		// Update character counter
		if (characterCounter && validationResult.characterCount !== undefined) {
			updateCharacterCounter(
				characterCounter, 
				validationResult.characterCount, 
				field.maxLength!,
				validationResult.remainingCharacters
			);
		}

		// Update validation messages
		updateValidationMessages(validationContainer, validationResult);

		// Update field styling based on validation
		updateFieldStyling(fieldContainer, input, validationResult);

		// Call the onChange callback
		onChange(currentValue, validationResult.valid);
	};

	// Add event listeners
	if (field.type === 'checkbox') {
		input.addEventListener('change', validateAndUpdate);
	} else {
		input.addEventListener('input', validateAndUpdate);
		input.addEventListener('change', validateAndUpdate);
	}

	// Initial validation
	if (initialValue) {
		setTimeout(validateAndUpdate, 100);
	}

	return input;
}

/**
 * Update character counter display
 */
function updateCharacterCounter(
	counterEl: HTMLElement, 
	currentCount: number, 
	maxLength: number,
	remainingChars?: number
): void {
	const remaining = remainingChars ?? (maxLength - currentCount);
	const percentage = (currentCount / maxLength) * 100;
	
	let status = 'safe';
	if (percentage > 90) {
		status = 'warning';
	}
	if (currentCount > maxLength) {
		status = 'error';
	}

	counterEl.className = `character-counter ${status}`;
	
	if (currentCount > maxLength) {
		counterEl.innerHTML = `
			<span class="count-display error">
				<span class="count-current">${currentCount}</span>
				<span class="count-separator">/</span>
				<span class="count-max">${maxLength}</span>
				<span class="over-limit">+${currentCount - maxLength}</span>
			</span>
		`;
	} else {
		counterEl.innerHTML = `
			<span class="count-display">
				<span class="count-current">${currentCount}</span>
				<span class="count-separator">/</span>
				<span class="count-max">${maxLength}</span>
			</span>
			<span class="remaining-display">${remaining} left</span>
		`;
	}

	// Add progress bar
	const progressBar = counterEl.querySelector('.progress-bar') as HTMLElement || 
					   counterEl.createDiv('progress-bar');
	const progressFill = progressBar.querySelector('.progress-fill') as HTMLElement || 
						progressBar.createDiv('progress-fill');
	
	progressFill.style.width = `${Math.min(percentage, 100)}%`;
	
	if (currentCount > maxLength) {
		progressFill.className = 'progress-fill error';
	} else if (percentage > 90) {
		progressFill.className = 'progress-fill warning';
	} else {
		progressFill.className = 'progress-fill safe';
	}
}

/**
 * Update validation messages
 */
function updateValidationMessages(
	container: HTMLElement, 
	result: ValidationResult
): void {
	container.empty();

	if (result.errors.length > 0) {
		result.errors.forEach(error => {
			const errorEl = container.createDiv('validation-message error');
			errorEl.innerHTML = `
				<span class="validation-icon">❌</span>
				<span class="validation-text">${error}</span>
			`;
		});
	}

	if (result.warnings.length > 0) {
		result.warnings.forEach(warning => {
			const warningEl = container.createDiv('validation-message warning');
			warningEl.innerHTML = `
				<span class="validation-icon">⚠️</span>
				<span class="validation-text">${warning}</span>
			`;
		});
	}
}

/**
 * Update field styling based on validation state
 */
function updateFieldStyling(
	fieldContainer: HTMLElement,
	input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
	result: ValidationResult
): void {
	// Remove existing validation classes
	fieldContainer.removeClass('field-valid', 'field-warning', 'field-error');
	input.removeClass('input-valid', 'input-warning', 'input-error');

	// Add appropriate classes
	if (result.errors.length > 0) {
		fieldContainer.addClass('field-error');
		input.addClass('input-error');
	} else if (result.warnings.length > 0) {
		fieldContainer.addClass('field-warning');
		input.addClass('input-warning');
	} else if (input.value && input.value.length > 0) {
		fieldContainer.addClass('field-valid');
		input.addClass('input-valid');
	}
}

/**
 * Get CSS styles for enhanced form fields
 */
export function getEnhancedFormFieldCSS(): string {
	return `
		.enhanced-form-field {
			border: 1px solid var(--background-modifier-border);
			border-radius: 8px;
			padding: 16px;
			background: var(--background-primary);
			transition: all 0.2s ease;
			margin-bottom: 16px;
		}

		.enhanced-form-field:hover {
			border-color: var(--interactive-accent);
			box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
		}

		.enhanced-form-field.has-character-limit {
			border-left: 4px solid var(--text-accent);
		}

		.enhanced-form-field.field-error {
			border-color: var(--text-error);
			background: rgba(239, 68, 68, 0.05);
		}

		.enhanced-form-field.field-warning {
			border-color: var(--text-warning);
			background: rgba(245, 158, 11, 0.05);
		}

		.enhanced-form-field.field-valid {
			border-color: var(--text-success);
		}

		.field-header {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			margin-bottom: 8px;
			gap: 12px;
		}

		.label-content {
			flex: 1;
		}

		.field-name {
			font-weight: 600;
			color: var(--text-normal);
		}

		.required-indicator {
			color: var(--text-error);
			margin-left: 2px;
			font-weight: bold;
		}

		.field-description {
			color: var(--text-muted);
			margin-top: 4px;
			line-height: 1.4;
			font-size: 0.9rem;
		}

		.character-counter {
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			gap: 4px;
			min-width: 120px;
		}

		.count-display {
			display: flex;
			align-items: center;
			gap: 2px;
			font-family: monospace;
			font-size: 0.9rem;
		}

		.count-current {
			font-weight: bold;
		}

		.count-separator {
			color: var(--text-muted);
		}

		.count-max {
			color: var(--text-muted);
		}

		.over-limit {
			color: var(--text-error);
			font-weight: bold;
			margin-left: 4px;
		}

		.remaining-display {
			font-size: 0.8rem;
			color: var(--text-muted);
		}

		.character-counter.warning .count-current {
			color: var(--text-warning);
		}

		.character-counter.error .count-current {
			color: var(--text-error);
		}

		.character-counter.safe .count-current {
			color: var(--text-success);
		}

		.progress-bar {
			width: 80px;
			height: 4px;
			background: var(--background-modifier-border);
			border-radius: 2px;
			overflow: hidden;
		}

		.progress-fill {
			height: 100%;
			transition: all 0.3s ease;
			border-radius: 2px;
		}

		.progress-fill.safe {
			background: var(--text-success);
		}

		.progress-fill.warning {
			background: var(--text-warning);
		}

		.progress-fill.error {
			background: var(--text-error);
		}

		.field-input {
			width: 100%;
			padding: 12px 16px;
			border: 2px solid var(--background-modifier-border);
			border-radius: 4px;
			font-size: 14px;
			background: var(--background-primary);
			color: var(--text-normal);
			transition: all 0.2s ease;
			font-family: var(--font-interface);
		}

		.field-input:focus {
			outline: none;
			border-color: var(--interactive-accent);
			box-shadow: 0 0 0 3px var(--interactive-accent-hover);
		}

		.field-input.input-error {
			border-color: var(--text-error);
		}

		.field-input.input-error:focus {
			border-color: var(--text-error);
			box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
		}

		.field-input.input-warning {
			border-color: var(--text-warning);
		}

		.field-input.input-warning:focus {
			border-color: var(--text-warning);
			box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
		}

		.field-input.input-valid {
			border-color: var(--text-success);
		}

		.validation-messages {
			margin-top: 8px;
		}

		.validation-message {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 6px 8px;
			border-radius: 4px;
			margin-bottom: 4px;
			font-size: 0.9rem;
		}

		.validation-message.error {
			background: rgba(239, 68, 68, 0.1);
			color: var(--text-error);
			border: 1px solid rgba(239, 68, 68, 0.2);
		}

		.validation-message.warning {
			background: rgba(245, 158, 11, 0.1);
			color: var(--text-warning);
			border: 1px solid rgba(245, 158, 11, 0.2);
		}

		.validation-icon {
			flex-shrink: 0;
		}

		.validation-text {
			flex: 1;
		}

		.checkbox-container {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 0;
		}

		.field-checkbox {
			width: auto !important;
			margin: 0 !important;
		}

		.checkbox-label {
			font-weight: 500;
		}
	`;
}