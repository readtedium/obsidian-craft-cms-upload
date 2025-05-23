export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function sanitizeFilename(filename: string): string {
	if (!filename) return '';
	
	return filename
		.replace(/[<>:"/\\|?*@]/g, '-') // Replace problematic chars
		.replace(/^\.+/, '') // Remove leading dots
		.replace(/\.+$/, '') // Remove trailing dots  
		.replace(/-+/g, '-') // Collapse multiple dashes
		.replace(/^-|-$/g, '') // Remove leading/trailing dashes
		.substring(0, 100); // Limit length
}

export function extractFilenameFromUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		let filename = urlObj.pathname.split('/').pop() || '';
		
		// Remove query parameters if they exist
		filename = filename.split('?')[0];
		
		// If we got a weird filename or no filename, generate a clean one
		if (!filename || filename.length < 3 || filename.includes('@') || 
			filename.startsWith('bafkrei') || filename.length > 50) {
			
			// Use domain + timestamp for a clean filename
			const domain = urlObj.hostname.replace(/^www\./, '');
			const timestamp = Date.now().toString(36); // Base36 for shorter string
			filename = `${domain}-${timestamp}.jpg`;
		}
		
		// Ensure it has a proper extension
		if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
			// Try to determine extension from URL or default to jpg
			if (url.toLowerCase().includes('png')) {
				filename += '.png';
			} else if (url.toLowerCase().includes('gif')) {
				filename += '.gif';
			} else if (url.toLowerCase().includes('webp')) {
				filename += '.webp';
			} else {
				filename += '.jpg';
			}
		}
		
		// Clean up the filename
		filename = filename
			.replace(/[^a-zA-Z0-9.-]/g, '-') // Replace special chars with dashes
			.replace(/-+/g, '-') // Collapse multiple dashes
			.replace(/^-|-$/g, ''); // Remove leading/trailing dashes
		
		console.log('🏷️ Generated filename from URL:', filename);
		return filename;
		
	} catch (error) {
		console.warn('Could not parse URL, using default filename');
		return `image-${Date.now()}.jpg`;
	}
}

export function getMimeType(filename: string): string {
	const ext = filename.toLowerCase().split('.').pop();
	const mimeTypes: { [key: string]: string } = {
		'jpg': 'image/jpeg',
		'jpeg': 'image/jpeg',
		'png': 'image/png',
		'gif': 'image/gif',
		'webp': 'image/webp',
		'svg': 'image/svg+xml'
	};
	return mimeTypes[ext || ''] || 'image/jpeg';
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}