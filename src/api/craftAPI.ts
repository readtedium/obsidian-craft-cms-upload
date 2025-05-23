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

	async createPost(postData: PostData, tagIds: number[] = []): Promise<CraftPost> {
		const mutation = `
			mutation CreatePost(
				$title: String!
				$body: String!
				$enabled: Boolean
				$deck: String
				$shortDeck: String
				$slug: String
				$postDate: DateTime
				$metaHeadline: String
				$metaDescription: String
				$tags: [Int]
			) {
				save_posts_posts_Entry(
					title: $title
					body: $body
					enabled: $enabled
					deck: $deck
					shortDeck: $shortDeck
					slug: $slug
					postDate: $postDate
					metaHeadline: $metaHeadline
					metaDescription: $metaDescription
					tags: $tags
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

		const variables = {
			title: postData.title,
			body: postData.body,
			enabled: postData.enabled,
			deck: postData.deck,
			shortDeck: postData.shortDeck,
			slug: postData.slug,
			postDate: postData.postDate,
			metaHeadline: postData.metaHeadline,
			metaDescription: postData.metaDescription,
			tags: tagIds.length > 0 ? tagIds : undefined
		};

		const response = await this.makeRequest<{ save_posts_posts_Entry: CraftPost }>(
			mutation, 
			variables
		);

		if (response.errors) {
			throw new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`);
		}

		if (!response.data?.save_posts_posts_Entry) {
			throw new Error(`Unexpected response format: ${JSON.stringify(response)}`);
		}

		return response.data.save_posts_posts_Entry;
	}

	async updatePost(postId: string, postData: PostData, tagIds: number[] = []): Promise<CraftPost> {
		const mutation = `
			mutation UpdatePost(
				$id: ID!
				$title: String!
				$body: String!
				$enabled: Boolean
				$deck: String
				$shortDeck: String
				$slug: String
				$postDate: DateTime
				$metaHeadline: String
				$metaDescription: String
				$tags: [Int]
			) {
				save_posts_posts_Entry(
					id: $id
					title: $title
					body: $body
					enabled: $enabled
					deck: $deck
					shortDeck: $shortDeck
					slug: $slug
					postDate: $postDate
					metaHeadline: $metaHeadline
					metaDescription: $metaDescription
					tags: $tags
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

		const variables = {
			id: postId,
			title: postData.title,
			body: postData.body,
			enabled: postData.enabled,
			deck: postData.deck,
			shortDeck: postData.shortDeck,
			slug: postData.slug,
			postDate: postData.postDate,
			metaHeadline: postData.metaHeadline,
			metaDescription: postData.metaDescription,
			tags: tagIds.length > 0 ? tagIds : undefined
		};

		const response = await this.makeRequest<{ save_posts_posts_Entry: CraftPost }>(
			mutation, 
			variables
		);

		if (response.errors) {
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