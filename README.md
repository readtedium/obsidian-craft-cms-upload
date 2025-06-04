# Obsidian Craft CMS Plugin

An attempt to leverage Craft CMS' powerful GraphQL integrations in a clever way—by effectively turning Obsidian into a front-end for your Craft site. Write in Obsidian, publish to Craft CMS, and manage your entire editorial pipeline without leaving your favorite editor. (Pretty wild, huh?)

This is tested on version 4.x but will likely work on version 5.x. The current design is built around the schema for [Tedium: The Dull Side of the Internet](https://tedium.co/), which is Markdown-centric, but the hope is to make it site-agnostic long-term.

This was built as part of an experiment in vibe coding by Tedium editor [Ernie Smith](https://erniesmith.net). [He explains his thinking in this post](https://tedium.co/2025/05/25/ai-bionic-arm-vibe-coding-thoughts/). If you're not into that kind of thing, 100% fine—but he thought it might be useful to show how to use a tool like Claude in a way that can enable more flexible editorial creation processes.

> **⚠️ Active Development Notice**: This plugin is under heavy development with frequent changes expected. Features and APIs may change without notice as we refine the experience.

## Current Status

### ✅ What Works Now

- **Article Publishing**: Upload markdown posts with full frontmatter support
- **Automatic Tag Creation**: Tags that don't exist are automatically created during upload
- **Image Management**: Upload images directly from Obsidian with drag-and-drop support
- **Smart Forms**: Dynamic upload forms that adapt to your Craft CMS content types
- **Schema Introspection**: Automatically discover your Craft CMS structure (sections, fields, content types)
- **Draft Mode**: Save posts as drafts before publishing
- **Frontmatter Integration**: Seamlessly sync metadata between Obsidian and Craft CMS
- **Connection Testing**: Built-in tools to validate your API setup
- **Advanced DateTime Handling**: Timezone-aware scheduling with precise time control
- **Professional Upload Interface**: Tabbed forms with asset pickers and real-time validation
- **Webhook Integration**: Automatic webhook triggering after uploads + manual webhook commands
- **Force Craft Re-save**: Trigger Craft's built-in webhooks without manual reloading

### 🔄 In Development

- **Enhanced Author & Category Management**: Improved handling of taxonomies
- **Batch Operations**: Upload multiple posts at once
- **Content Pulling**: Import existing Craft CMS content for editing in Obsidian
- **Advanced Field Mapping**: Smarter handling of custom field types

## Features

### Dynamic Schema Analysis

The plugin intelligently analyzes your Craft CMS GraphQL schema to:

- Discover all available content types and sections
- Map custom fields to appropriate form inputs
- Validate content before upload
- Generate context-aware upload forms

### Professional Upload Interface

Choose from multiple upload experiences:

- **Quick Upload**: Fast upload with minimal options
- **Smart Upload**: Schema-aware form with field validation
- **Tabbed Interface**: Professional multi-tab form organized by field categories (Article, Meta, Social, Taxonomy, Media, Advanced)

### Advanced DateTime Management

The plugin provides sophisticated date and time handling:

- **Timezone-Aware Scheduling**: Configure your site's timezone for accurate post timing
- **Precise Time Control**: Separate date and time inputs with quick-select buttons (9 AM, 12 PM, 3 PM, 6 PM, Now)
- **Smart Date Processing**: Handles various frontmatter date formats and preserves existing timestamps
- **Visual Timeline**: Clear timezone indicators and current time display
- **Default Post Times**: Set your preferred publishing time (perfect for morning newsletters!)

### Intelligent Content Mapping

The plugin automatically:

- Maps frontmatter fields to Craft CMS fields
- Handles complex field types (assets, relations, taxonomies)
- **Creates missing tags automatically** during upload
- Preserves existing content when updating
- Maintains clean, canonical metadata

### Image Management

- Upload images via drag-and-drop or URL
- Automatic filename sanitization
- Asset picker interface
- Generate Craft CMS asset codes for embedding

### Webhook Integration

- **Automatic webhook triggering** after successful uploads
- **Manual webhook commands** for existing posts
- **Force Craft re-save** functionality (triggers built-in Craft webhooks)
- Configurable webhook headers and authentication
- Built-in webhook testing tools

## Setup

### Prerequisites

- Obsidian installed
- Craft CMS site with GraphQL API enabled
- API token with appropriate permissions

### Installation

1. Download the plugin files to your vault's `.obsidian/plugins/` directory
2. Enable the plugin in Obsidian settings
3. Set up GraphQL API access in Craft CMS (see below)
4. Configure your Craft CMS connection in the plugin settings

### Setting Up GraphQL API Access

This is the trickiest part, but essential for the plugin to work. In your Craft CMS admin:

#### 1. Enable GraphQL API
- Go to **Settings → GraphQL**
- Create a new schema (or use the default "Public Schema")
- Enable the sections, entry types, and field types you want to access
- **Important**: Enable Users, Assets, Tags, and Categories schemas

#### 2. Create an API Token
- Go to **Settings → GraphQL → Tokens**
- Click **New Token**
- Give it a descriptive name (e.g., "Obsidian Plugin")
- Select your schema
- Set permissions:
  - **Queries**: Enable all content you want to read
  - **Mutations**: Enable content creation/editing permissions
  - **Schema introspection**: Enable (required for dynamic forms)

#### 3. Find Your GraphQL Endpoint
Your GraphQL endpoint will typically be:
```
https://yoursite.com/index.php?action=graphql/api
```

Or if you have pretty URLs enabled:
```
https://yoursite.com/api
```

Test your endpoint by visiting it in a browser - you should see the GraphQL Playground interface.

### Configuration

Navigate to **Settings → Craft CMS Upload** in Obsidian and configure:

- **GraphQL Endpoint**: Your Craft CMS GraphQL API URL (see above)
- **API Token**: The token you created in Craft CMS
- **Section Handle**: Default section for posts (e.g., "posts")
- **Author ID**: Your default author ID (find this in Craft CMS → Users)
- **Base URL**: Your site's base URL for admin links
- **Timezone**: Your site's timezone for accurate post scheduling
- **Default Post Time**: Preferred time for new posts (e.g., "09:00" for 9 AM)
- **Date Format**: How dates are formatted for Craft CMS (ISO 8601 recommended)
- **Webhook Settings**: Configure automatic webhook triggering after uploads

#### Finding Your Author ID
In Craft CMS, go to **Users**, click on your user account, and look at the URL. The number at the end is your Author ID (e.g., `/admin/users/1` means your Author ID is `1`).

## Usage

### Basic Article Upload

1. Write your article in Obsidian with frontmatter:

```yaml
---
title: "My Great Article"
deck: "A compelling subtitle"
tags: ["technology", "innovation"]
slug: "my-great-article"
postDate: "2024-01-15T09:00:00-05:00"
---

Your article content here...
```

2. Use **Cmd/Ctrl + P** → "Upload current post to Craft CMS"

### Smart Upload with Dynamic Forms

1. Use **Cmd/Ctrl + P** → "Tabbed Upload (Smart Form)"
2. Select your content type from the dropdown
3. Fill out the dynamically generated form organized in professional tabs
4. Upload or save as draft

### Image Upload

1. Use **Cmd/Ctrl + P** → "Upload image to Craft CMS"
2. Choose a local file or paste a URL
3. The plugin generates a Craft CMS asset code you can paste into your articles

### Schema Analysis

Use **Cmd/Ctrl + P** → "Analyze Craft CMS Schema" to:

- Discover all your content types and fields
- View field counts and organization
- Debug schema-related issues

### Webhook Management

Configure webhooks in plugin settings, then:

- **Automatic**: Webhooks trigger after every successful upload
- **Manual**: Use **Cmd/Ctrl + P** → "Trigger webhook for current post"
- **Force Re-save**: Use **Cmd/Ctrl + P** → "Force Craft CMS re-save" to trigger built-in Craft webhooks

## Technical Architecture

### Key Components

- **Schema Introspector**: Analyzes Craft CMS GraphQL schema
- **Dynamic Form Generator**: Creates context-aware upload forms  
- **Field Mapper**: Intelligently maps Obsidian frontmatter to Craft fields
- **Image Manager**: Handles asset uploads and management
- **API Client**: Robust GraphQL client with error handling
- **DateTime Manager**: Advanced timezone-aware date/time handling
- **Webhook Manager**: Handles webhook triggering and Craft re-save functionality

### Smart Field Mapping

The plugin includes intelligent field mapping for common scenarios:

```typescript
// Example automatic mappings
'featuredImage' → 'image' (asset field)
'postAuthor' → author lookup by name
'tags' → automatic tag discovery/creation
'enabled' → publish status handling
```

### Schema-Driven Interface

The plugin dynamically generates forms based on your Craft CMS schema:

- **Essential Fields**: title, body, slug (always shown first)
- **Content Fields**: deck, shortDeck, meta fields
- **Advanced Fields**: All remaining custom fields (collapsible)
- **Validation**: Real-time field validation against schema

## Commands

| Command | Description |
|---------|-------------|
| `Upload current post to Craft CMS` | Quick upload of active document |
| `Upload post to Craft CMS (with options)` | Upload with draft/options dialog |
| `Upload as NEW post (ignore existing ID)` | Force create new post |
| `Smart Upload (Schema-based)` | Schema-aware upload with validation |
| `Dynamic Upload (Smart Form)` | Adaptive form based on content type |
| `Tabbed Upload (Smart Form)` | Professional tabbed interface |
| `Upload image to Craft CMS` | Image upload with asset code generation |
| `Open post in Craft CMS` | Open current post in Craft admin |
| `Test Craft CMS connection` | Validate API configuration |
| `Analyze Craft CMS Schema` | Explore your CMS structure |
| `Trigger webhook for current post` | Manual webhook trigger |
| `Force Craft CMS re-save (triggers webhooks)` | Force Craft re-save to trigger webhooks |

## Frontmatter Support

The plugin supports comprehensive frontmatter integration:

```yaml
---
# Core Content
title: "Article Title"
deck: "Article subtitle"
body: "Article content" # Auto-populated
slug: "url-slug"

# Publishing & Timing
enabled: true
postDate: "2024-01-15T09:00:00-05:00" # Full datetime with timezone
postAuthor: "Author Name"

# SEO & Meta
metaHeadline: "SEO Title"
metaDescription: "SEO description"

# Taxonomy (automatically created if missing)
tags: ["tag1", "tag2"]
category: "Category Name"

# Media
image: "12345" # Asset ID
featuredImage: "67890" # Asset ID

# Craft CMS Integration (auto-generated)
craftPostId: "123"
craftUrl: "https://example.com/article"
---
```

## Development

### Project Structure

```
src/
├── api/           # Craft CMS API integration
├── content/       # Content processing
├── settings/      # Plugin configuration
├── ui/           # User interface components
└── utils/        # Utility functions
```

### Key Files

- `main.ts` - Plugin entry point and command registration
- `src/api/craftAPI.ts` - GraphQL client and API methods
- `src/api/schemaIntrospector.ts` - Schema analysis and introspection
- `src/ui/tabbedUploadModal.ts` - Professional tabbed upload interface
- `src/content/imageManager.ts` - Image upload and asset management
- `src/utils/dateUtils.ts` - Advanced datetime handling and timezone management
- `src/settings/settingsTab.ts` - Plugin configuration interface

## Troubleshooting

### Common Issues

**Connection Failed**
- Verify your GraphQL endpoint URL (try visiting it in a browser)
- Check API token permissions and ensure it's copied correctly
- Ensure GraphQL API is enabled in Craft CMS
- Verify your schema includes the sections you're trying to access

**Schema Not Loading**
- Verify token has schema introspection permissions in Craft CMS
- Ensure Users, Assets, Tags, and Categories are enabled in your GraphQL schema
- Check for GraphQL endpoint accessibility
- Review browser console for detailed errors

**Upload Failures**
- Validate required fields are present
- Check content type permissions
- Ensure section handle is correct

**DateTime/Timezone Issues**
- Verify timezone is correctly set in plugin settings
- Check that postDate follows ISO 8601 format with timezone
- Ensure your Craft CMS server timezone matches your configuration
- Use the datetime preview in settings to verify current time display

**Tag Creation Issues**
- Ensure your API token has permissions to create tags
- Verify the `save_tags_Tag` mutation is available in your schema
- Check browser console for tag creation errors

**Webhook Issues**
- Test webhook configuration using the built-in test button
- Verify webhook URL is accessible and returns 200-299 status codes
- Check webhook headers are properly formatted JSON
- Use "Force Craft CMS re-save" as alternative to trigger built-in webhooks

### Debug Mode

Enable debug logging by opening browser console while using the plugin. All operations log detailed information for troubleshooting.

## Roadmap

- **Enhanced Author Management**: Full author lookup and assignment
- **Category Hierarchies**: Support for nested category structures  
- **Batch Processing**: Multi-file upload operations
- **Content Sync**: Two-way sync between Obsidian and Craft CMS
- **Template System**: Predefined content templates
- **Preview Mode**: Preview before publish
- **Workflow Integration**: Editorial workflow support
- **Advanced Webhook Features**: Conditional webhooks, webhook templates, retry logic

## Contributing

This plugin is in active development. While we welcome feedback and bug reports, please note that the API and features are subject to frequent changes.

## License

MIT License - See LICENSE file for details

---

*Built for content creators who want the power of Craft CMS with the writing experience of Obsidian. Or giant nerds who think CMS platforms could learn something from dedicated writing tools.*