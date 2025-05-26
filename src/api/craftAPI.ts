import { requestUrl } from 'obsidian';
import { 
	CraftCMSSettings, 
	PostData, 
	CraftPost, 
	CraftAsset, 
	CraftTag, 
	GraphQLResponse, 
	FileUpload 
} from './types';

export class CraftAPI {
	constructor(private settings: CraftCMSSettings) {}

	private async makeRequest<T>(query: string, variables?: any): Promise<GraphQLResponse<T>> {
		const response = await requestUrl({
			url: this.settings.endpoint,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.token}`
			},
			body: JSON.stringify({
				query,
				variables
			})
		});

		return response.json;
	}

	async testConnection(): Promise<boolean> {
		const query = `
			query TestConnection {
				entries(section: "${this.settings.sectionHandle}", limit: 1) {
					id
					title
				}
			}
		`;

		try {
			const response = await this.makeRequest(query);
			return !!(response.data && !response.errors);
		} catch (error) {
			console.error('Connection test failed:', error);
			return false;
		}
	}

	async findTags(tagNames: string[]): Promise<number[]> {
		if (!tagNames || tagNames.length === 0) {
			return [];
		}

		const tagIds: number[] = [];

		for (const tagName of tagNames) {
			try {
				const query = `
					query FindTag($titles: [String]) {
						tags(title: $titles, limit: 1) {
							id
							title
						}
					}
				`;

				const response = await this.makeRequest<{ tags: CraftTag[] }>(
					query, 
					{ titles: [tagName] }
				);

				if (response.data?.tags?.length && response.data.tags.length > 0) {
					const existingTag = response.data.tags[0];
					tagIds.push(parseInt(existingTag.id));
					console.log(`✅ Found existing tag: ${tagName} (ID: ${existingTag.id})`);
				} else {
					console.log(`⏭️ Tag not found: ${tagName}`);
				}
			} catch (error) {
				console.warn(`❌ Error processing tag ${tagName}:`, error);
			}
		}

		return tagIds;
	}

// Cache for author lookups to avoid repeated API calls
	private authorCache: Array<{id: string, name: string}> = [];
	private authorCacheLoaded = false;

	// Load authors for name-to-ID conversion
	private async loadAuthorCache(): Promise<void> {
		if (this.authorCacheLoaded) return;

		try {
			const authorsQuery = `
				query GetAuthors {
					entries(section: "author", limit: 50) {
						id
						title
						... on author_author_Entry {
							firstName
							lastName
						}
					}
				}
			`;

			const response = await this.makeRequest<{ entries: any[] }>(authorsQuery);
			
			if (response.data?.entries) {
				this.authorCache = response.data.entries.map((author: any) => {
					const displayName = author.firstName && author.lastName 
						? `${author.firstName} ${author.lastName}` 
						: author.title;
					
					return {
						id: author.id,
						name: displayName
					};
				});

				console.log('📋 Loaded author cache:', this.authorCache);
				this.authorCacheLoaded = true;
			}
		} catch (error) {
			console.error('⚠️ Failed to load author cache:', error);
			this.authorCacheLoaded = true; // Don't keep trying
		}
	}

	// Convert author name to ID
	private async getAuthorId(nameOrId: string): Promise<number | null> {
		// If it's already a number, return it
		if (!isNaN(parseInt(nameOrId))) {
			return parseInt(nameOrId);
		}

		// Load author cache if not loaded
		await this.loadAuthorCache();

		// Find author by name
		const author = this.authorCache.find(a => 
			a.name.toLowerCase() === nameOrId.toLowerCase() ||
			a.name.toLowerCase().includes(nameOrId.toLowerCase()) ||
			nameOrId.toLowerCase().includes(a.name.toLowerCase())
		);

		if (author) {
			console.log(`✅ Found author: "${nameOrId}" → ID ${author.id}`);
			return parseInt(author.id);
		}

		console.log(`❌ Author not found: "${nameOrId}"`);
		return null;
	}

	// Enhanced field mapping with author lookup
	private fieldMappings: Record<string, { craftName: string; graphqlType: string; transform?: (value: any) => Promise<any> | any }> = {
		// Image fields
		'featuredImage': { craftName: 'image', graphqlType: '[Int]', transform: (v) => v ? [parseInt(v)] : null },
		'image': { craftName: 'image', graphqlType: '[Int]', transform: (v) => v ? [parseInt(v)] : null },
		
		// Ad fields - these might not exist in schema, so we'll skip them
		'sidebarAdToggle': { craftName: 'sidebarAd', graphqlType: '[Int]', transform: (v) => null },
		'topBarAdToggle': { craftName: 'topAd', graphqlType: '[Int]', transform: (v) => null },
		'bottomAdToggle': { craftName: 'bottomAdToggle', graphqlType: 'Boolean' },
		'optimizeAds': { craftName: 'optimizeAds', graphqlType: 'Boolean' },
		
		// Author field - required user field (now that users schema is enabled!)
		'author': { 
			craftName: 'author',    // Back to 'author' now that users work
			graphqlType: '[Int]',   // Probably array of user IDs
			transform: (v) => v ? [parseInt(v)] : null
		},
		
		// PostAuthor field - custom byline author (could be guest authors)
		'postAuthor': { 
			craftName: 'postAuthor', 
			graphqlType: '[Int]', 
			transform: async (v) => {
				const authorId = await this.getAuthorId(v);
				return authorId ? [authorId] : null;
			}
		},
		
		// Category field - expects array of IDs  
		'category': { craftName: 'category', graphqlType: '[Int]', transform: (v) => v ? [parseInt(v)] : null },
	};

	private async getMappedField(key: string, value: any, supportedFields: string[] = []): Promise<{ name: string; type: string; value: any } | null> {
		const mapping = this.fieldMappings[key];
		
		// Check if the target field exists in the schema
		const targetFieldName = mapping ? mapping.craftName : key;
		if (supportedFields.length > 0 && !supportedFields.includes(targetFieldName)) {
			console.log(`⏭️ Skipping field ${key} → ${targetFieldName} (not in schema)`);
			return null;
		}
		
		if (mapping) {
			const transformedValue = mapping.transform ? await mapping.transform(value) : value;
			// Skip fields that transform to null (unsupported or invalid)
			if (transformedValue === null) {
				console.log(`⏭️ Skipping field ${key} (transformed to null)`);
				return null;
			}
			return {
				name: mapping.craftName,
				type: mapping.graphqlType,
				value: transformedValue
			};
		}
		
		// Default handling for unmapped fields
		let graphqlType = 'String';
		if (typeof value === 'boolean') {
			graphqlType = 'Boolean';
		} else if (typeof value === 'number' || !isNaN(Number(value))) {
			graphqlType = 'Int';
		} else if (Array.isArray(value)) {
			graphqlType = '[String]';
		}
		
		return {
			name: key,
			type: graphqlType,
			value: value
		};
	}

	async createPost(postData: PostData, tagIds: number[] = [], supportedFields: string[] = []): Promise<CraftPost> {
		// Build dynamic field variables for the mutation
		const dynamicFieldVars: string[] = [];
		const dynamicFieldInputs: string[] = [];
		const mutationVariables: any = {};

		// Core fields that we always handle
		const coreFields = [
			'title', 'body', 'enabled', 'deck', 'shortDeck', 'slug', 'postDate', 
			'metaHeadline', 'metaDescription', 'tags'
		];

		// Add core field variables
		coreFields.forEach(field => {
			if (field === 'tags') {
				dynamicFieldVars.push('$tags: [Int]');
				dynamicFieldInputs.push('tags: $tags');
			} else if (field === 'enabled') {
				dynamicFieldVars.push('$enabled: Boolean');
				dynamicFieldInputs.push('enabled: $enabled');
			} else if (field === 'postDate') {
				dynamicFieldVars.push('$postDate: DateTime');
				dynamicFieldInputs.push('postDate: $postDate');
				dynamicFieldInputs.push('postDate: $postDate');
			} else {
				dynamicFieldVars.push(`$${field}: String`);
				dynamicFieldInputs.push(`${field}: $${field}`);
			}
		});

		// Add core field values
		mutationVariables.title = postData.title;
		mutationVariables.body = postData.body;
		mutationVariables.enabled = postData.enabled;
		mutationVariables.deck = postData.deck;
		mutationVariables.shortDeck = postData.shortDeck;
		mutationVariables.slug = postData.slug;
		mutationVariables.postDate = postData.postDate;
		mutationVariables.metaHeadline = postData.metaHeadline;
		mutationVariables.metaDescription = postData.metaDescription;
		mutationVariables.tags = tagIds.length > 0 ? tagIds : undefined;

		// Process dynamic fields (with async lookups)
		for (const [key, value] of Object.entries(postData)) {
			if (!coreFields.includes(key) && value !== undefined && value !== '') {
				const mappedField = await this.getMappedField(key, value, supportedFields);
				if (mappedField) {
					console.log(`🔄 Adding mapped field to mutation: ${key} → ${mappedField.name} (${mappedField.type}) = ${JSON.stringify(mappedField.value)}`);
					
					// Use the mapped field name and type
					const varName = mappedField.name;
					dynamicFieldVars.push(`$${varName}: ${mappedField.type}`);
					dynamicFieldInputs.push(`${varName}: $${varName}`);
					mutationVariables[varName] = mappedField.value;
				}
			}
		}

		const mutation = `
			mutation CreatePost(
				${dynamicFieldVars.join(',\n\t\t\t\t')}
			) {
				save_posts_posts_Entry(
					${dynamicFieldInputs.join(',\n\t\t\t\t\t')}
				) {
					id
					title
					url
					slug
					deck
					shortDeck
					postDate
					tags {
						id
						title
					}
				}
			}
		`;

		console.log('🚀 Mapped GraphQL Mutation:', mutation);
		console.log('🚀 Mapped Mutation Variables:', mutationVariables);

		const response = await this.makeRequest<{ save_posts_posts_Entry: CraftPost }>(
			mutation, 
			mutationVariables
		);

		if (response.errors) {
			console.error('💥 GraphQL errors:', response.errors);
			throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
		}

		if (!response.data?.save_posts_posts_Entry) {
			throw new Error(`Unexpected response format: ${JSON.stringify(response)}`);
		}

		return response.data.save_posts_posts_Entry;
	}

async updatePost(postId: string, postData: PostData, tagIds: number[] = [], supportedFields: string[] = []): Promise<CraftPost> {
		const dynamicFieldVars: string[] = [];
		const dynamicFieldInputs: string[] = [];
		const mutationVariables: any = {};

		// Core fields that we always handle
		const coreFields = [
			'id', 'title', 'body', 'enabled', 'deck', 'shortDeck', 'slug', 'postDate', 
			'metaHeadline', 'metaDescription', 'tags'
		];

		// Add core field variables and inputs together
		coreFields.forEach(field => {
			if (field === 'id') {
				dynamicFieldVars.push('$id: ID!');
				dynamicFieldInputs.push('id: $id');
			} else if (field === 'tags') {
				dynamicFieldVars.push('$tags: [Int]');
				dynamicFieldInputs.push('tags: $tags');
			} else if (field === 'enabled') {
				dynamicFieldVars.push('$enabled: Boolean');
				dynamicFieldInputs.push('enabled: $enabled');
			} else if (field === 'postDate') {
				dynamicFieldVars.push('$postDate: DateTime');
				dynamicFieldInputs.push('postDate: $postDate');  // Make sure this is included!
			} else {
				dynamicFieldVars.push(`$${field}: String`);
				dynamicFieldInputs.push(`${field}: $${field}`);
			}
		});

		// Add core field values
		mutationVariables.id = postId;
		mutationVariables.title = postData.title;
		mutationVariables.body = postData.body;
		mutationVariables.enabled = postData.enabled;
		mutationVariables.deck = postData.deck;
		mutationVariables.shortDeck = postData.shortDeck;
		mutationVariables.slug = postData.slug;
		mutationVariables.postDate = postData.postDate;
		mutationVariables.metaHeadline = postData.metaHeadline;
		mutationVariables.metaDescription = postData.metaDescription;
		mutationVariables.tags = tagIds.length > 0 ? tagIds : undefined;

		console.log('🔍 DEBUG: Core variables set, including postDate:', mutationVariables.postDate);
		console.log('🔍 DEBUG: Core inputs include postDate:', dynamicFieldInputs.includes('postDate: $postDate'));

		// Process dynamic fields (skip core fields to avoid duplicates)
		for (const [key, value] of Object.entries(postData)) {
			if (!coreFields.includes(key) && value !== undefined && value !== '') {
				const mappedField = await this.getMappedField(key, value, supportedFields);
				if (mappedField) {
					console.log(`🔄 Adding mapped field: ${key} → ${mappedField.name} (${mappedField.type}) = ${JSON.stringify(mappedField.value)}`);
					
					const varName = mappedField.name;
					const varDeclaration = `$${varName}: ${mappedField.type}`;
					const inputDeclaration = `${varName}: $${varName}`;
					
					if (!dynamicFieldVars.includes(varDeclaration)) {
						dynamicFieldVars.push(varDeclaration);
						dynamicFieldInputs.push(inputDeclaration);
						mutationVariables[varName] = mappedField.value;
					}
				}
			}
		}

		const mutation = `
			mutation UpdatePost(
				${dynamicFieldVars.join(',\n\t\t\t\t')}
			) {
				save_posts_posts_Entry(
					${dynamicFieldInputs.join(',\n\t\t\t\t\t')}
				) {
					id
					title
					url
					slug
					deck
					shortDeck
					postDate
					enabled
					tags {
						id
						title
					}
				}
			}
		`;

		console.log('🔄 Clean mutation:', mutation);
		console.log('🔄 Variables:', mutationVariables);

		const response = await this.makeRequest<{ save_posts_posts_Entry: CraftPost }>(
			mutation, 
			mutationVariables
		);

		if (response.errors) {
			console.error('💥 GraphQL errors:', response.errors);
			throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
		}

		if (!response.data?.save_posts_posts_Entry) {
			throw new Error(`Unexpected response format: ${JSON.stringify(response)}`);
		}

		return response.data.save_posts_posts_Entry;
	}

	async uploadImage(file: FileUpload, title?: string): Promise<CraftAsset> {
		const mutation = `
			mutation UploadImage($file: FileInput!, $title: String) {
				save_images_Asset(
					_file: $file
					title: $title
				) {
					id
					url
					filename
					title
				}
			}
		`;

		const response = await this.makeRequest<{ save_images_Asset: CraftAsset }>(
			mutation,
			{
				file,
				title: title || file.filename.replace(/\.[^/.]+$/, "")
			}
		);

		if (response.errors) {
			console.error('💥 GraphQL errors:', response.errors);
			throw new Error(`Upload failed: ${response.errors.map(e => e.message).join(', ')}`);
		}

		if (!response.data?.save_images_Asset) {
			throw new Error(`Unexpected response format: ${JSON.stringify(response)}`);
		}

		console.log('✅ Image uploaded successfully:', response.data.save_images_Asset);
		return response.data.save_images_Asset;
	}

	// For future content pulling feature
	async getPostBySlug(slug: string): Promise<CraftPost | null> {
		const query = `
			query GetPostBySlug($slug: [String]) {
				entries(section: "${this.settings.sectionHandle}", slug: $slug, limit: 1) {
					id
					title
					url
					slug
					... on posts_posts_Entry {
						deck
						shortDeck
						postDate
						body
						tags {
							id
							title
						}
					}
				}
			}
		`;

		const response = await this.makeRequest<{ entries: CraftPost[] }>(
			query,
			{ slug: [slug] }
		);

		if (response.errors) {
			throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
		}

		return response.data?.entries?.[0] || null;
	}

	// For future schema introspection
	async introspectSchema(): Promise<any> {
		const query = `
			query IntrospectionQuery {
				__schema {
					types {
						name
						kind
						fields {
							name
							type {
								name
								kind
							}
						}
					}
				}
			}
		`;

		const response = await this.makeRequest<{ __schema: any }>(query);
		return response.data?.__schema;
	}
}