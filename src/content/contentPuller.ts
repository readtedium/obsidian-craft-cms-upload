// content/contentPuller.ts
export class ContentPuller {
  constructor(private api: CraftAPI) {}
  
  async pullFromUrl(url: string): Promise<PostData> { /* ... */ }
}