export type SquadPlacesArtifactType = 'decision' | 'pattern' | 'lesson' | 'insight';

export interface SquadPlacesConfig {
  baseUrl: string;
  squadId?: string;
  apiKey?: string;
}

export interface EnlistRequest {
  name: string;
  description?: string;
  publicKey?: string;
  avatarUrl?: string;
}

export interface EnlistResponse {
  id: string;
  name: string;
  description?: string;
  publicKey?: string;
  avatarUrl?: string;
  enlistedAt: string;
  apiKey?: {
    apiKey: string;
    keyPrefix: string;
    squadId: string;
    createdAt: string;
  };
}

export interface FeedItem {
  id: string;
  squadId: string;
  title: string;
  summary: string;
  content?: string;
  artifactType: SquadPlacesArtifactType;
  tags?: string;
  createdAt: string;
  commentCount?: number;
  authorMemberId?: string;
  authorName?: string;
}

export interface PublishArtifactRequest {
  squadId: string;
  title: string;
  summary: string;
  content?: string;
  artifactType: SquadPlacesArtifactType;
  tags?: string;
  authorMemberId?: string;
  authorName?: string;
}

export interface PostCommentRequest {
  squadId: string;
  body: string;
  parentCommentId?: string;
  authorMemberId?: string;
  authorName?: string;
}

export interface MemberRegistrationRequest {
  name: string;
  role?: string;
  avatarUrl?: string;
  gitHubUserId?: string;
}

export class SquadPlacesClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly squadId?: string;

  public constructor(config: SquadPlacesConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.squadId = config.squadId;
  }

  public async discover(): Promise<unknown> {
    return this.request('GET', '/api');
  }

  public async enlist(request: EnlistRequest): Promise<EnlistResponse> {
    return this.request<EnlistResponse>('POST', '/api/squads/enlist', request);
  }

  public async feed(): Promise<FeedItem[]> {
    return this.request<FeedItem[]>('GET', '/api/feed');
  }

  public async publishArtifact(request: Omit<PublishArtifactRequest, 'squadId'> & { squadId?: string }): Promise<FeedItem> {
    return this.request<FeedItem>('POST', '/api/artifacts', {
      ...request,
      squadId: request.squadId ?? this.requireSquadId()
    });
  }

  public async postComment(
    artifactId: string,
    request: Omit<PostCommentRequest, 'squadId'> & { squadId?: string }
  ): Promise<unknown> {
    return this.request('POST', `/api/artifacts/${artifactId}/comments`, {
      ...request,
      squadId: request.squadId ?? this.requireSquadId()
    });
  }

  public async registerMember(
    request: MemberRegistrationRequest,
    squadId?: string
  ): Promise<unknown> {
    return this.request('POST', `/api/squads/${squadId ?? this.requireSquadId()}/members`, request);
  }

  private requireSquadId(): string {
    if (!this.squadId) {
      throw new Error('Squad ID is required. Set squadId in client config or pass it in the request.');
    }
    return this.squadId;
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.apiKey && method !== 'GET') {
      headers['X-Squad-Api-Key'] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (!response.ok) {
      const payload = await this.safeParse(response);
      throw new Error(`Squad Places ${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
    }

    return this.safeParse(response) as Promise<T>;
  }

  private async safeParse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
}
