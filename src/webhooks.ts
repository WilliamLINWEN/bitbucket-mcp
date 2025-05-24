/**
 * Webhook management for the Bitbucket MCP server
 */

export interface Webhook {
  uuid: string;
  url: string;
  description: string;
  subject_type: string;
  subject: {
    type: string;
    name: string;
    full_name: string;
  };
  events: string[];
  active: boolean;
  created_at: string;
  links: {
    self: { href: string };
  };
}

export interface WebhookCreateRequest {
  description: string;
  url: string;
  active?: boolean;
  events: string[];
  secret?: string;
}

export interface WebhookUpdateRequest {
  description?: string;
  url?: string;
  active?: boolean;
  events?: string[];
  secret?: string;
}

export interface WebhookDelivery {
  uuid: string;
  event: string;
  webhook: {
    uuid: string;
  };
  delivered_at: string;
  status_code: number;
  success: boolean;
  attempts: number;
  links: {
    self: { href: string };
  };
}

/**
 * Available webhook events for Bitbucket repositories
 */
export const WEBHOOK_EVENTS = {
  // Repository events
  'repo:push': 'Repository push',
  'repo:fork': 'Repository fork',
  'repo:updated': 'Repository updated',
  'repo:commit_comment_created': 'Commit comment created',
  'repo:commit_status_created': 'Commit status created',
  'repo:commit_status_updated': 'Commit status updated',
  
  // Pull request events
  'pullrequest:created': 'Pull request created',
  'pullrequest:updated': 'Pull request updated',
  'pullrequest:approved': 'Pull request approved',
  'pullrequest:unapproved': 'Pull request unapproved',
  'pullrequest:fulfilled': 'Pull request merged',
  'pullrequest:rejected': 'Pull request declined',
  'pullrequest:comment_created': 'Pull request comment created',
  'pullrequest:comment_updated': 'Pull request comment updated',
  'pullrequest:comment_deleted': 'Pull request comment deleted',
  
  // Issue events
  'issue:created': 'Issue created',
  'issue:updated': 'Issue updated',
  'issue:comment_created': 'Issue comment created',
  
  // Wiki events
  'wiki:created': 'Wiki page created',
  'wiki:updated': 'Wiki page updated',
} as const;

export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;

/**
 * Webhook validation utilities
 */
export class WebhookValidator {
  /**
   * Validate webhook URL
   */
  static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Validate webhook events
   */
  static validateEvents(events: string[]): { valid: boolean; invalidEvents: string[] } {
    const validEvents = Object.keys(WEBHOOK_EVENTS);
    const invalidEvents = events.filter(event => !validEvents.includes(event));
    
    return {
      valid: invalidEvents.length === 0,
      invalidEvents,
    };
  }

  /**
   * Validate webhook creation request
   */
  static validateCreateRequest(request: WebhookCreateRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.description || request.description.trim().length === 0) {
      errors.push('Description is required');
    }

    if (!request.url || !this.isValidUrl(request.url)) {
      errors.push('Valid URL is required');
    }

    if (!request.events || request.events.length === 0) {
      errors.push('At least one event is required');
    } else {
      const eventValidation = this.validateEvents(request.events);
      if (!eventValidation.valid) {
        errors.push(`Invalid events: ${eventValidation.invalidEvents.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Webhook template generator
 */
export class WebhookTemplates {
  /**
   * Get common webhook templates
   */
  static getTemplates(): Record<string, { description: string; events: string[]; example_url: string }> {
    return {
      'ci-cd': {
        description: 'CI/CD Pipeline Integration',
        events: ['repo:push', 'pullrequest:created', 'pullrequest:updated'],
        example_url: 'https://your-ci-server.com/hooks/bitbucket',
      },
      'notifications': {
        description: 'Team Notifications',
        events: [
          'pullrequest:created',
          'pullrequest:approved',
          'pullrequest:fulfilled',
          'issue:created',
          'issue:updated',
        ],
        example_url: 'https://your-notification-service.com/webhooks/bitbucket',
      },
      'security': {
        description: 'Security Monitoring',
        events: [
          'repo:push',
          'repo:fork',
          'pullrequest:created',
          'repo:commit_status_created',
        ],
        example_url: 'https://your-security-service.com/webhooks/bitbucket',
      },
      'documentation': {
        description: 'Documentation Updates',
        events: ['repo:push', 'wiki:created', 'wiki:updated'],
        example_url: 'https://your-docs-service.com/webhooks/bitbucket',
      },
      'code-review': {
        description: 'Code Review Automation',
        events: [
          'pullrequest:created',
          'pullrequest:updated',
          'pullrequest:comment_created',
          'pullrequest:approved',
          'pullrequest:unapproved',
        ],
        example_url: 'https://your-review-bot.com/webhooks/bitbucket',
      },
    };
  }

  /**
   * Get template by name
   */
  static getTemplate(name: string): { description: string; events: string[]; example_url: string } | null {
    const templates = this.getTemplates();
    return templates[name] || null;
  }

  /**
   * Get all template names
   */
  static getTemplateNames(): string[] {
    return Object.keys(this.getTemplates());
  }
}

/**
 * Webhook management utilities
 */
export class WebhookManager {
  /**
   * Format webhook for display
   */
  static formatWebhook(webhook: Webhook): string {
    const status = webhook.active ? '✅ Active' : '❌ Inactive';
    const eventCount = webhook.events.length;
    
    return [
      `**${webhook.description}**`,
      `  UUID: ${webhook.uuid}`,
      `  URL: ${webhook.url}`,
      `  Status: ${status}`,
      `  Events: ${eventCount} configured`,
      `  Subject: ${webhook.subject.full_name}`,
      `  Created: ${new Date(webhook.created_at).toLocaleString()}`,
      '',
      '**Configured Events:**',
      ...webhook.events.map(event => `  • ${event}: ${WEBHOOK_EVENTS[event as WebhookEvent] || 'Unknown event'}`),
    ].join('\n');
  }

  /**
   * Format webhook list for display
   */
  static formatWebhookList(webhooks: Webhook[]): string {
    if (webhooks.length === 0) {
      return 'No webhooks configured.';
    }

    return webhooks.map((webhook, index) => [
      `## Webhook ${index + 1}: ${webhook.description}`,
      `**Status:** ${webhook.active ? '✅ Active' : '❌ Inactive'}`,
      `**URL:** ${webhook.url}`,
      `**Events:** ${webhook.events.length} configured`,
      `**UUID:** ${webhook.uuid}`,
      `**Created:** ${new Date(webhook.created_at).toLocaleString()}`,
      '',
    ].join('\n')).join('\n');
  }

  /**
   * Format webhook delivery for display
   */
  static formatWebhookDelivery(delivery: WebhookDelivery): string {
    const status = delivery.success ? '✅ Success' : '❌ Failed';
    
    return [
      `**Delivery ${delivery.uuid}**`,
      `  Event: ${delivery.event}`,
      `  Status: ${status} (${delivery.status_code})`,
      `  Delivered: ${new Date(delivery.delivered_at).toLocaleString()}`,
      `  Attempts: ${delivery.attempts}`,
      `  Webhook: ${delivery.webhook.uuid}`,
    ].join('\n');
  }

  /**
   * Generate webhook creation summary
   */
  static generateCreationSummary(request: WebhookCreateRequest, webhook: Webhook): string {
    return [
      '# ✅ Webhook Created Successfully',
      '',
      `**Description:** ${webhook.description}`,
      `**URL:** ${webhook.url}`,
      `**Status:** ${webhook.active ? '✅ Active' : '❌ Inactive'}`,
      `**UUID:** ${webhook.uuid}`,
      `**Created:** ${new Date(webhook.created_at).toLocaleString()}`,
      '',
      '**Configured Events:**',
      ...webhook.events.map(event => `• ${event}: ${WEBHOOK_EVENTS[event as WebhookEvent] || 'Unknown event'}`),
      '',
      '**Next Steps:**',
      '• Test your webhook endpoint to ensure it can receive requests',
      '• Monitor webhook deliveries for any failures',
      '• Update webhook configuration as needed using update-webhook tool',
    ].join('\n');
  }

  /**
   * Generate webhook update summary
   */
  static generateUpdateSummary(
    oldWebhook: Webhook, 
    newWebhook: Webhook, 
    changes: string[]
  ): string {
    return [
      '# ✅ Webhook Updated Successfully',
      '',
      `**Description:** ${newWebhook.description}`,
      `**UUID:** ${newWebhook.uuid}`,
      '',
      '**Changes Applied:**',
      ...changes.map(change => `• ${change}`),
      '',
      '**Current Configuration:**',
      `• **URL:** ${newWebhook.url}`,
      `• **Status:** ${newWebhook.active ? '✅ Active' : '❌ Inactive'}`,
      `• **Events:** ${newWebhook.events.length} configured`,
      '',
      '**Configured Events:**',
      ...newWebhook.events.map(event => `• ${event}: ${WEBHOOK_EVENTS[event as WebhookEvent] || 'Unknown event'}`),
    ].join('\n');
  }

  /**
   * Generate webhook test summary
   */
  static generateTestSummary(webhook: Webhook, testResult: any): string {
    return [
      '# 🧪 Webhook Test Results',
      '',
      `**Webhook:** ${webhook.description}`,
      `**URL:** ${webhook.url}`,
      `**UUID:** ${webhook.uuid}`,
      '',
      '**Test Details:**',
      `• **Test Event:** repo:push (test event)`,
      `• **Response Code:** ${testResult.status_code || 'N/A'}`,
      `• **Success:** ${testResult.success ? '✅ Yes' : '❌ No'}`,
      `• **Response Time:** ${testResult.response_time || 'N/A'}ms`,
      '',
      testResult.success 
        ? '✅ **Webhook is working correctly!**'
        : '❌ **Webhook test failed. Please check your endpoint.**',
    ].join('\n');
  }
}

/**
 * Webhook security utilities
 */
export class WebhookSecurity {
  /**
   * Generate secure random secret for webhook
   */
  static generateSecret(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  /**
   * Get security recommendations for webhook setup
   */
  static getSecurityRecommendations(): string[] {
    return [
      'Use HTTPS URLs only for webhook endpoints',
      'Implement webhook signature verification using the secret',
      'Validate webhook payloads before processing',
      'Implement rate limiting on your webhook endpoint',
      'Log webhook deliveries for debugging and monitoring',
      'Use specific events instead of subscribing to all events',
      'Implement timeout handling for webhook processing',
      'Set up monitoring and alerting for webhook failures',
    ];
  }
}
