// Add these new fields to your types.ts:
export interface CraftCMSSettings {
	endpoint: string;
	token: string;
	sectionHandle: string;
	authorId: string;
	autoSavePostId: boolean;
	baseUrl: string;
	liveUrlBase: string;
	// New datetime fields
	timezone: string;
	defaultPostTime: string;
	dateFormat: 'iso' | 'craft';
	// New webhook fields
	webhookUrl?: string;
	webhookEnabled?: boolean;
	webhookHeaders?: Record<string, string>;
}

export interface PostData {
	title: string;
	body: string;
	deck?: string;
	shortDeck?: string;
	slug?: string;
	metaHeadline?: string;
	metaDescription?: string;
	tags?: string[];
	enabled?: boolean;
	postDate?: string;
	featuredImage?: string;
	sidebarAdToggle?: boolean;
	topBarAdToggle?: boolean;
	bottomAdToggle?: boolean;
	optimizeAds?: boolean;
	
	// Add the author field (this is the required user field)
	author?: string | number;
	
	// Keep postAuthor for the custom byline field
	postAuthor?: string;
	
	// Add other common fields that might be used
	category?: string | number;
	image?: string | number;
	
	// Allow any other dynamic fields
	[key: string]: any;
}

export interface CraftPost {
	id: string;
	title: string;
	url: string;
	slug: string;
	deck?: string;
	shortDeck?: string;
	postDate: string;
	tags?: Array<{
		id: string;
		title: string;
	}>;
}

export interface CraftAsset {
	id: string;
	url: string;
	filename: string;
	title: string;
}

export interface CraftTag {
	id: string;
	title: string;
}

export interface UploadOptions {
	asDraft?: boolean;
	forceNew?: boolean;
}

export interface GraphQLResponse<T = any> {
	data?: T;
	errors?: Array<{
		message: string;
		locations?: Array<{
			line: number;
			column: number;
		}>;
		path?: string[];
	}>;
}

export interface FileUpload {
	fileData: string; // Data URL format
	filename: string;
}

// For future schema introspection feature
export interface CraftField {
	name: string;
	type: string;
	required: boolean;
	description?: string;
}

export interface CraftContentType {
	handle: string;
	name: string;
	fields: CraftField[];
}