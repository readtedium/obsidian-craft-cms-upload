// src/utils/dateUtils.ts
export interface DateTimeSettings {
	timezone: string; // e.g., 'America/New_York', 'UTC'
	defaultTime: string; // e.g., '09:00' for 9 AM
	dateFormat: 'iso' | 'craft'; // Output format preference
}

export class DateTimeManager {
	private settings: DateTimeSettings;
	
	constructor(settings: Partial<DateTimeSettings> = {}) {
		this.settings = {
			timezone: settings.timezone || this.detectTimezone(),
			defaultTime: settings.defaultTime || '09:00',
			dateFormat: settings.dateFormat || 'iso'
		};
	}

	/**
	 * Detect user's timezone automatically
	 */
	private detectTimezone(): string {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {
			return 'UTC'; // Fallback
		}
	}

	/**
	 * Parse a date string with proper timezone handling
	 */
	parseDate(dateString: string): Date {
		if (!dateString) return new Date();

		// Handle various input formats
		if (dateString.includes('T') || dateString.includes(' ')) {
			// Already has time component
			return new Date(dateString);
		} else {
			// Date only - add default time in the specified timezone
			const dateWithTime = `${dateString}T${this.settings.defaultTime}:00`;
			return new Date(dateWithTime);
		}
	}

	/**
	 * Format date for Craft CMS (ISO format with timezone)
	 */
	formatForCraft(date: Date): string {
		// Craft CMS expects ISO format: 2024-01-15T09:00:00-05:00
		return date.toISOString();
	}

	/**
	 * Format date for display in forms
	 */
	formatForDisplay(date: Date): { date: string; time: string } {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');

		return {
			date: `${year}-${month}-${day}`,
			time: `${hours}:${minutes}`
		};
	}

	/**
	 * Combine separate date and time inputs
	 */
	combineDateTime(dateStr: string, timeStr: string): Date {
		const combinedStr = `${dateStr}T${timeStr}:00`;
		return new Date(combinedStr);
	}

	/**
	 * Get current date/time in the configured timezone
	 */
	getCurrentDateTime(): Date {
		return new Date();
	}

	/**
	 * Convert frontmatter date to proper format
	 */
	processFrontmatterDate(value: any): string {
		if (!value) {
			return this.formatForCraft(this.getCurrentDateTime());
		}

		if (typeof value === 'string') {
			const parsed = this.parseDate(value);
			return this.formatForCraft(parsed);
		}

		if (value instanceof Date) {
			return this.formatForCraft(value);
		}

		// Fallback to current time
		return this.formatForCraft(this.getCurrentDateTime());
	}

	/**
	 * Update settings (useful for plugin settings)
	 */
	updateSettings(newSettings: Partial<DateTimeSettings>): void {
		this.settings = { ...this.settings, ...newSettings };
	}

	/**
	 * Get current settings (public accessor)
	 */
	getSettings(): DateTimeSettings {
		return { ...this.settings };
	}

	/**
	 * Get available timezone options for settings
	 */
	static getTimezoneOptions(): Array<{ value: string; label: string }> {
		const common = [
			'UTC',
			'America/New_York',
			'America/Chicago', 
			'America/Denver',
			'America/Los_Angeles',
			'America/Toronto',
			'Europe/London',
			'Europe/Paris',
			'Europe/Berlin',
			'Asia/Tokyo',
			'Australia/Sydney'
		];

		return common.map(tz => ({
			value: tz,
			label: tz.replace('_', ' ').replace('/', ' / ')
		}));
	}
}

/**
 * Enhanced form field renderer for date/time inputs
 */
export function renderDateTimeField(
	container: HTMLElement,
	field: { name: string; label: string; required?: boolean },
	initialValue: string,
	dateTimeManager: DateTimeManager,
	onChange: (value: string) => void
): void {
	const fieldContainer = container.createDiv('datetime-field-container');
	
	// Label
	const label = fieldContainer.createEl('label', { cls: 'field-label' });
	label.innerHTML = `
		<span class="field-name">${field.label}</span>
		${field.required ? '<span class="required-indicator">*</span>' : ''}
	`;

	// Parse initial value
	const initialDate = dateTimeManager.parseDate(initialValue);
	const { date: initialDateStr, time: initialTimeStr } = dateTimeManager.formatForDisplay(initialDate);

	// Input container
	const inputContainer = fieldContainer.createDiv('datetime-input-container');
	
	// Date input
	const dateInput = inputContainer.createEl('input', {
		type: 'date',
		cls: 'datetime-date-input',
		value: initialDateStr
	});

	// Time input  
	const timeInput = inputContainer.createEl('input', {
		type: 'time',
		cls: 'datetime-time-input',
		value: initialTimeStr
	});

	// Timezone display
	const timezoneDisplay = inputContainer.createDiv('timezone-display');
	timezoneDisplay.textContent = `(${dateTimeManager.getSettings().timezone})`;

	// Update handler
	const updateValue = () => {
		const combinedDate = dateTimeManager.combineDateTime(dateInput.value, timeInput.value);
		const formattedValue = dateTimeManager.formatForCraft(combinedDate);
		onChange(formattedValue);
	};

	dateInput.addEventListener('change', updateValue);
	timeInput.addEventListener('change', updateValue);

	// Quick time buttons
	const quickTimeContainer = inputContainer.createDiv('quick-time-buttons');
	const quickTimes = [
		{ label: '9 AM', value: '09:00' },
		{ label: '12 PM', value: '12:00' },
		{ label: '3 PM', value: '15:00' },
		{ label: '6 PM', value: '18:00' },
		{ label: 'Now', value: 'current' }
	];

	quickTimes.forEach(({ label, value }) => {
		const btn = quickTimeContainer.createEl('button', {
			text: label,
			cls: 'quick-time-btn',
			type: 'button'
		});

		btn.addEventListener('click', () => {
			if (value === 'current') {
				const now = new Date();
				const { date, time } = dateTimeManager.formatForDisplay(now);
				dateInput.value = date;
				timeInput.value = time;
			} else {
				timeInput.value = value;
			}
			updateValue();
		});
	});
}