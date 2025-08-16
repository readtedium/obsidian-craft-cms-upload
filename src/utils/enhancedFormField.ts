// src/utils/enhancedFormField.ts - Simplified version with manual limits only

import { FieldLimitsManager } from './fieldLimits';

/**
 * Simple enhanced form field with manual character limits
 */
export function renderFormFieldWithLimits(
	container: HTMLElement,
	field: { name: string; label: string; type: string; required?: boolean; placeholder?: string; options?: Array<{value: string, label: string}> },
	initialValue: string,
	fieldLimitsManager: FieldLimitsManager,
	onChange: (value: string, isValid: boolean) => void
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
	
	const fieldContainer = container.createDiv('enhanced-form-field');
	const hasLimit = fieldLimitsManager.hasLimit(field.name);
	
	// Add character limit class if applicable
	if (hasLimit) {
		fieldContainer.addClass('has-character-limit');
	}

	// Field header with label and character counter
	const fieldHeader = fieldContainer.createDiv('field-header');
	
	const labelContent = fieldHeader.createDiv('label-content');
	labelContent.innerHTML = `
		<span class="field-name">${field.label}</span>
		${field.required ? '<span class="required-indicator">*</span>' : ''}
	`;

	// Character counter (only show for text fields with limits)
	let characterCounter: HTMLElement | null = null;
	if (hasLimit && field.type !== 'checkbox' && field.type !== 'select') {
		const limit = fieldLimitsManager.getLimit(field.name)!;
		characterCounter = fieldHeader.createDiv('character-counter');
		updateCharacterCounter(characterCounter, 0, limit);
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

	// Set placeholder
	if (field.placeholder && field.type !== 'select' && field.type !== 'checkbox') {
		(input as HTMLInputElement | HTMLTextAreaElement).placeholder = field.placeholder;
	}

	// Set max length if there's a limit
	if (hasLimit && field.type !== 'checkbox' && field.type !== 'select') {
		const limit = fieldLimitsManager.getLimit(field.name)!;
		input.setAttribute('maxlength', limit.toString());
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

		// Validate using the field limits manager
		const validation = fieldLimitsManager.validateField(field.name, currentValue);
		
		// Check required field
		if (field.required && (!currentValue || currentValue.trim().length === 0)) {
			validation.valid = false;
			validation.errors.push(`${field.label} is required`);
		}

		// Update character counter
		if (characterCounter && validation.limit) {
			updateCharacterCounter(
				characterCounter, 
				validation.characterCount, 
				validation.limit,
				validation.remaining
			);
		}

		// Update validation messages
		updateValidationMessages(validationContainer, validation);

		// Update field styling
		updateFieldStyling(fieldContainer, input, validation);

		// Call the onChange callback
		onChange(currentValue, validation.valid);
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
	remainingChars?: number | null
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
	result: { valid: boolean; errors: string[]; warnings: string[] }
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
	result: { valid: boolean; errors: string[]; warnings: string[] }
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
 * Subtle CSS styles for enhanced form fields
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
			border-left: 3px solid var(--text-muted); /* Subtle gray instead of bright accent */
		}

		.enhanced-form-field.field-valid {
			border-color: var(--background-modifier-border-hover); /* Much more subtle than bright green */
		}

		.character-counter.safe .count-current {
			color: var(--text-normal); /* Normal text color instead of bright green */
		}

		.character-counter.warning .count-current {
			color: var(--text-warning); /* Keep warning color */
		}

		.character-counter.error .count-current {
			color: var(--text-error); /* Keep error color */
		}

		.progress-fill.safe {
			background: var(--text-muted); /* Subtle gray instead of bright green */
			opacity: 0.6; /* Make it even more subtle */
		}

		.progress-fill.warning {
			background: var(--text-warning);
			opacity: 0.8;
		}

		.progress-fill.error {
			background: var(--text-error);
		}

		.field-input.input-valid {
			border-color: var(--background-modifier-border-focus); /* Subtle instead of bright green */
		}

		/* Make the character counter less prominent overall */
		.character-counter {
			opacity: 0.7; /* Slightly faded */
			font-size: 0.85rem; /* Smaller text */
		}

		.character-counter:hover {
			opacity: 1; /* Full opacity on hover */
		}

		/* More subtle validation messages */
		.validation-message.error {
			background: rgba(239, 68, 68, 0.08); /* Less intense red background */
		}

		.validation-message.warning {
			background: rgba(245, 158, 11, 0.08); /* Less intense yellow background */
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