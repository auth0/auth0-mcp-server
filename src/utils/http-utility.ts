import { HandlerResponse } from './types';

// Add network error handling utility
export function handleNetworkError(error: any): string {
  if (error.name === 'AbortError') {
    return 'request timed out. The Auth0 API did not respond in time.';
  } else if (error instanceof TypeError) {
    return `network error: ${error.message || 'Failed to connect'}`;
  } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return `Connection failed: Unable to reach the Auth0 API (${error.code}). Check your network connection.`;
  } else if (error.code === 'ECONNRESET') {
    return 'Connection was reset by the server. Try again later.';
  } else {
    return `Error: ${error.message || error}`;
  }
}

// Helper function to ensure domain is properly formatted
export function formatDomain(domain: string): string {
  if (!domain) return '';

  // Remove protocol (http:// or https://)
  let formattedDomain = domain.replace(/^https?:\/\//, '');

  // Remove trailing slash
  formattedDomain = formattedDomain.replace(/\/$/, '');

  return formattedDomain.includes('.') ? formattedDomain : `${formattedDomain}.us.auth0.com`;
}

// Helper function to create success response
export function createSuccessResponse(result: object | Array<any>): HandlerResponse {
  // Check if result is an array and has more than one item
  if (Array.isArray(result) && result.length > 1) {
    const mutiContent = result.map((item) => {
      return {
        type: 'text',
        text: JSON.stringify(item, null, 2),
      };
    });
    return {
      content: mutiContent,
      isError: false,
    };
  } else {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: false,
    };
  }
}

// Helper function to create error response
export function createErrorResponse(errorString: string): HandlerResponse {
  // Return a standard response
  return {
    content: [
      {
        type: 'text',
        text: errorString,
      },
    ],
    isError: true,
  };
}
